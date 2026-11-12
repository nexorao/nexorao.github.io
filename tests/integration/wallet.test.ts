import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, eq } from "drizzle-orm";
import { closeAllDbPools, createDb, schema } from "@/db/client";
import { closePool as closeMainPool } from "@/db";
import {
  InsufficientCreditsError,
  commitReservation,
  deductCredits,
  ensureDailyGrant,
  expireBuckets,
  expireStaleReservations,
  getOrCreateWallet,
  grantCredits,
  listActiveBuckets,
  releaseReservation,
  reserveCredits,
  verifyLedger,
} from "@/lib/wallet";
import { hashPassword } from "@/lib/crypto/password";
import type { CreditReservation } from "@/db/schema";

/**
 * Wallet integration tests — run against a REAL PostgreSQL (nexora_test,
 * migrated + seeded by tests/global-setup.ts). These exercise row locks,
 * advisory locks, the append-only trigger and the race-condition guarantees
 * from spec §6.
 */
const db = createDb(process.env.DATABASE_URL as string);

let user1Id: string;
let user2Id: string;
let wallet1Id: string;
let wallet2Id: string;
let seq = 0;

async function createUser(): Promise<string> {
  const email = `wallet-test-${Date.now()}-${seq++}@test.nexora`;
  const [row] = await db
    .insert(schema.users)
    .values({
      email,
      name: "Wallet Test",
      passwordHash: hashPassword("Passw0rd123"),
      emailVerifiedAt: new Date(),
    })
    .returning();
  return row.id;
}

function sumBuckets(walletId: string): Promise<number> {
  return db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.walletBuckets.credits}), 0)`,
    })
    .from(schema.walletBuckets)
    .where(eq(schema.walletBuckets.walletId, walletId))
    .then((rows) => Number(rows[0].total));
}

beforeAll(async () => {
  user1Id = await createUser();
  user2Id = await createUser();
  wallet1Id = (await getOrCreateWallet(user1Id)).id;
  wallet2Id = (await getOrCreateWallet(user2Id)).id;
});

afterAll(async () => {
  await closeAllDbPools();
  await closeMainPool();
});

describe("daily free grant", () => {
  it("grants the free plan's daily allowance once per UTC day", async () => {
    const first = await ensureDailyGrant(user1Id);
    expect(first).toEqual({ granted: 100 });

    const second = await ensureDailyGrant(user1Id);
    expect(second).toEqual({ granted: 0, reason: "already_granted" });

    // Exactly one daily_grant ledger row for this wallet.
    const rows = await db
      .select()
      .from(schema.walletTransactions)
      .where(
        sql`${schema.walletTransactions.walletId} = ${wallet1Id} AND ${schema.walletTransactions.type} = 'daily_grant'`,
      );
    expect(rows).toHaveLength(1);
    expect(await verifyLedger(wallet1Id)).toMatchObject({ ok: true, ledgerSum: 100, bucketSum: 100 });
  });

  it("skips plans without a daily allowance", async () => {
    // No subscription → resolves the `free` plan for a fresh user; users on
    // paid plans (dailyFreeCredits = 0) are covered by the same branch.
    const [plan] = await db
      .update(schema.plans)
      .set({ dailyFreeCredits: 0 })
      .where(eq(schema.plans.id, "free"))
      .returning();
    const third = await ensureDailyGrant(user2Id);
    expect(third).toEqual({ granted: 0, reason: "plan_none" });
    await db.update(schema.plans).set({ dailyFreeCredits: 100 }).where(eq(schema.plans.id, plan.id));
  });
});

describe("reserve → commit / release lifecycle", () => {
  it("debits the estimate in consumption order", async () => {
    // daily_free holds 100; grant a promotional bucket that expires soonest.
    await grantCredits(wallet1Id, user1Id, {
      type: "promotional",
      amount: 50,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await grantCredits(wallet1Id, user1Id, { type: "purchased", amount: 200 });

    const result = await reserveCredits({
      userId: user1Id,
      estimatedCredits: 120,
      idempotencyKey: `test-hold-1-${seq}`,
    });

    // daily_free covers 100, promotional covers the remaining 20 of its 50 —
    // purchased stays untouched.
    expect(result.allocated.map((a) => a.bucketType)).toEqual(["daily_free", "promotional"]);
    const daily = result.allocated.find((a) => a.bucketType === "daily_free");
    expect(daily?.amount).toBe(100);
    const promo = result.allocated.find((a) => a.bucketType === "promotional");
    expect(promo?.amount).toBe(20);
    expect(result.allocated.find((a) => a.bucketType === "purchased")).toBeUndefined();

    expect(await verifyLedger(wallet1Id)).toMatchObject({ ok: true });
  });

  it("is idempotent per idempotencyKey", async () => {
    const key = `test-hold-idem-${seq}`;
    const first = await reserveCredits({
      userId: user1Id,
      estimatedCredits: 30,
      idempotencyKey: key,
    });
    const balanceAfterFirst = await sumBuckets(wallet1Id);

    const second = await reserveCredits({
      userId: user1Id,
      estimatedCredits: 30,
      idempotencyKey: key,
    });
    expect(second.reservationId).toBe(first.reservationId);
    expect(await sumBuckets(wallet1Id)).toBe(balanceAfterFirst);
  });

  it("commits actual usage and refunds only the unused portion", async () => {
    const key = `test-commit-${seq}`;
    const reserve = await reserveCredits({
      userId: user1Id,
      estimatedCredits: 100,
      idempotencyKey: key,
    });
    const before = await sumBuckets(wallet1Id);

    const result = await commitReservation(reserve.reservationId, 40);
    expect(result).toMatchObject({ charged: 40, released: 60, status: "committed" });
    expect(await sumBuckets(wallet1Id)).toBe(before + 60);
    expect(await verifyLedger(wallet1Id)).toMatchObject({ ok: true });

    // Committing twice is a no-op with the recorded actual.
    const again = await commitReservation(reserve.reservationId, 40);
    expect(again).toMatchObject({ charged: 40, released: 0, status: "committed" });
    expect(await sumBuckets(wallet1Id)).toBe(before + 60);
  });

  it("caps actual at the estimate (never negative)", async () => {
    const key = `test-cap-${seq}`;
    const reserve = await reserveCredits({
      userId: user1Id,
      estimatedCredits: 50,
      idempotencyKey: key,
    });
    const before = await sumBuckets(wallet1Id);
    const result = await commitReservation(reserve.reservationId, 500);
    expect(result.charged).toBe(50);
    expect(await sumBuckets(wallet1Id)).toBe(before);
  });

  it("releases the full hold on provider failure", async () => {
    const key = `test-release-${seq}`;
    const reserve = await reserveCredits({
      userId: user1Id,
      estimatedCredits: 75,
      idempotencyKey: key,
    });
    const before = await sumBuckets(wallet1Id);
    const result = await releaseReservation(reserve.reservationId, "provider_down");
    expect(result).toMatchObject({ charged: 0, released: 75, status: "released" });
    expect(await sumBuckets(wallet1Id)).toBe(before + 75);
    expect(await verifyLedger(wallet1Id)).toMatchObject({ ok: true });
  });

  it("rejects holds larger than the balance with available credits", async () => {
    const balance = await sumBuckets(wallet1Id);
    await expect(
      reserveCredits({
        userId: user1Id,
        estimatedCredits: balance + 1,
        idempotencyKey: `test-over-${seq}`,
      }),
    ).rejects.toMatchObject({
      name: "InsufficientCreditsError",
      available: balance,
      required: balance + 1,
    });
  });
});

describe("concurrency (race conditions)", () => {
  it("never overspends under parallel reservation attempts", async () => {
    await grantCredits(wallet2Id, user2Id, { type: "purchased", amount: 100 });
    const starting = await sumBuckets(wallet2Id);
    expect(starting).toBe(100);

    const attempts = Array.from({ length: 8 }, (_, i) =>
      reserveCredits({
        userId: user2Id,
        estimatedCredits: 30,
        idempotencyKey: `race-${seq}-${i}`,
      }).then(
        (r) => ({ ok: true as const, id: r.reservationId }),
        (err: unknown) => ({ ok: false as const, err }),
      ),
    );
    const results = await Promise.all(attempts);

    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    expect(succeeded).toHaveLength(3); // floor(100/30)
    expect(failed).toHaveLength(5);
    for (const f of failed) {
      expect((f as { err: unknown }).err).toBeInstanceOf(InsufficientCreditsError);
    }

    // Balance is exactly 10 — never negative, never double-spent.
    expect(await sumBuckets(wallet2Id)).toBe(10);
    const verify = await verifyLedger(wallet2Id);
    expect(verify).toMatchObject({ ok: true, bucketSum: 10, ledgerSum: 10 });
  });

  it("settles parallel holds independently", async () => {
    const holds = await db
      .select()
      .from(schema.creditReservations)
      .where(eq(schema.creditReservations.walletId, wallet2Id));
    expect(holds.every((h) => h.status === "held")).toBe(true);

    await Promise.all(
      holds.map((h) => commitReservation(h.id, Math.ceil(Number(h.estimatedCredits) / 2))),
    );
    const settled = await db
      .select()
      .from(schema.creditReservations)
      .where(eq(schema.creditReservations.walletId, wallet2Id));
    expect(settled.every((h) => h.status === "committed")).toBe(true);
    expect(await verifyLedger(wallet2Id)).toMatchObject({ ok: true });
  });
});

describe("admin adjustments", () => {
  it("deducts via consumption order and records admin_deduct rows", async () => {
    const before = await sumBuckets(wallet1Id);
    const result = await deductCredits(user1Id, 25, "test:deduct", { reason: "test" });
    expect(result.balanceAfter).toBe(before - 25);

    const rows = await db
      .select()
      .from(schema.walletTransactions)
      .where(sql`${schema.walletTransactions.walletId} = ${wallet1Id} AND ${schema.walletTransactions.type} = 'admin_deduct'`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(await verifyLedger(wallet1Id)).toMatchObject({ ok: true });
  });

  it("refuses to deduct below zero", async () => {
    const balance = await sumBuckets(wallet1Id);
    await expect(deductCredits(user1Id, balance + 1, "test")).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    );
  });
});

describe("append-only ledger trigger", () => {
  it("blocks UPDATE on wallet_transactions", async () => {
    // Drizzle wraps driver errors; the trigger text lives on error.cause.
    await expect(
      db.execute(sql`UPDATE wallet_transactions SET amount = 0`),
    ).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/append-only/) },
    });
  });

  it("blocks DELETE on wallet_transactions", async () => {
    await expect(
      db.execute(sql`DELETE FROM wallet_transactions`),
    ).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/append-only/) },
    });
  });
});

describe("reconciler jobs", () => {
  it("zeroes expired buckets with matching expiry ledger rows", async () => {
    await grantCredits(wallet1Id, user1Id, {
      type: "promotional",
      amount: 40,
      expiresAt: new Date(Date.now() - 1_000), // already expired
    });
    const balanceBefore = await sumBuckets(wallet1Id);
    expect(balanceBefore).toBeGreaterThan(0);

    const expiredTotal = await expireBuckets();
    expect(expiredTotal).toBeGreaterThanOrEqual(40);
    expect(await sumBuckets(wallet1Id)).toBe(balanceBefore - 40);
    expect(await verifyLedger(wallet1Id)).toMatchObject({ ok: true });
  });

  it("releases stale held reservations past their TTL", async () => {
    const key = `stale-${seq}`;
    const reserve = await reserveCredits({
      userId: user1Id,
      estimatedCredits: 60,
      idempotencyKey: key,
    });
    const balanceBefore = await sumBuckets(wallet1Id);

    // Simulate the reservation aging past its TTL.
    await db
      .update(schema.creditReservations)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.creditReservations.id, reserve.reservationId));

    const count = await expireStaleReservations();
    expect(count).toBeGreaterThanOrEqual(1);

    const [row] = await db
      .select()
      .from(schema.creditReservations)
      .where(eq(schema.creditReservations.id, reserve.reservationId));
    expect(row?.status).toBe("released");
    expect(await sumBuckets(wallet1Id)).toBe(balanceBefore + 60);
    expect(await verifyLedger(wallet1Id)).toMatchObject({ ok: true });
  });

  it("leaves live reservations untouched", async () => {
    const key = `live-${seq}`;
    await reserveCredits({ userId: user1Id, estimatedCredits: 5, idempotencyKey: key });
    const [live] = await db
      .select()
      .from(schema.creditReservations)
      .where(eq(schema.creditReservations.idempotencyKey, key));
    expect(live?.status).toBe("held");
  });
});

describe("bucket listing", () => {
  it("hides zeroed and expired buckets from the active list", async () => {
    const buckets = await listActiveBuckets(wallet1Id);
    expect(buckets.every((b) => Number(b.credits) > 0)).toBe(true);
    expect(buckets.every((b) => !b.expiresAt || b.expiresAt > new Date())).toBe(true);
  });
});

// Keep the reservation type import meaningful for future assertions.
export type { CreditReservation };
