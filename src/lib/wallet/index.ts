// NOTE: intentionally no "server-only" guard here. Maintenance jobs
// (`npm run jobs:run`) import this module under plain Node via tsx, and the
// guard would throw there. Client bundles cannot import it anyway — pg and
// node:crypto fail to bundle for the browser, which the build catches.
import { db } from "../../db";
import {
  creditReservations,
  plans,
  subscriptions,
  walletBuckets,
  walletTransactions,
  wallets,
  type BucketType,
  type WalletBucket,
} from "../../db/schema";
import { planDebit, planRefund, type BucketView, type DebitAllocation } from "./allocate";
import { getSettings } from "../settings";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

/**
 * Credit wallet service (spec §6).
 *
 * Every mutation runs inside a single DB transaction, uses
 * SELECT … FOR UPDATE row locks, and writes matching append-only ledger
 * rows so that:
 *
 *   SUM(wallet_transactions.amount) == SUM(active wallet_buckets.credits)
 *
 * is always true. `verifyLedger()` re-checks that invariant.
 * Balances can never go negative: debits happen only against locked,
 * non-expiring buckets that provably hold the credits.
 */

export class InsufficientCreditsError extends Error {
  readonly available: number;
  readonly required: number;
  constructor(available: number, required: number) {
    super(`Insufficient credits: required ${required}, available ${available}`);
    this.name = "InsufficientCreditsError";
    this.available = available;
    this.required = required;
  }
}

export class ReservationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationStateError";
  }
}

// ---------------------------------------------------------------------------
// Wallet + balance basics
// ---------------------------------------------------------------------------

export async function getOrCreateWallet(userId: string) {
  const [existing] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(wallets).values({ userId }).returning();
  return created;
}

async function ledgerSum(walletId: string): Promise<number> {
  const [row] = await db
    .select({ sum: sql<string>`COALESCE(SUM(${walletTransactions.amount}), 0)` })
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, walletId));
  return Number(row.sum);
}

/** Live balance from buckets (non-expired only). */
export async function getWalletBalance(walletId: string): Promise<number> {
  const rows = await db
    .select({ credits: walletBuckets.credits })
    .from(walletBuckets)
    .where(
      and(
        eq(walletBuckets.walletId, walletId),
        or(isNull(walletBuckets.expiresAt), gt(walletBuckets.expiresAt, sql`now()`)),
      ),
    );
  return rows.reduce((acc, r) => acc + Number(r.credits), 0);
}

export async function listActiveBuckets(walletId: string): Promise<WalletBucket[]> {
  return db
    .select()
    .from(walletBuckets)
    .where(
      and(
        eq(walletBuckets.walletId, walletId),
        gt(walletBuckets.credits, 0),
        or(isNull(walletBuckets.expiresAt), gt(walletBuckets.expiresAt, sql`now()`)),
      ),
    )
    .orderBy(walletBuckets.type, walletBuckets.createdAt);
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export interface GrantInput {
  type: BucketType;
  amount: number;
  expiresAt?: Date | null;
  sourceRef?: string | null;
  reference?: string | null;
  metadata?: Record<string, unknown>;
}

/** Adds credits to the wallet as a bucket + paired ledger row (idempotent per reference by caller). */
export async function grantCredits(walletId: string, userId: string, input: GrantInput) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Grant amount must be a positive integer");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('wallet:' || ${walletId}))`);

    // Merge into an existing identical bucket when possible.
    const mergeConditions = [
      eq(walletBuckets.walletId, walletId),
      eq(walletBuckets.type, input.type),
      input.expiresAt
        ? eq(walletBuckets.expiresAt, input.expiresAt)
        : isNull(walletBuckets.expiresAt),
      input.sourceRef
        ? eq(walletBuckets.sourceRef, input.sourceRef)
        : isNull(walletBuckets.sourceRef),
    ];
    const [existingBucket] = await tx
      .select()
      .from(walletBuckets)
      .where(and(...mergeConditions))
      .limit(1);

    let bucketId: string;
    if (existingBucket) {
      bucketId = existingBucket.id;
      await tx
        .update(walletBuckets)
        .set({ credits: Number(existingBucket.credits) + input.amount, updatedAt: new Date() })
        .where(eq(walletBuckets.id, bucketId));
    } else {
      const [created] = await tx
        .insert(walletBuckets)
        .values({
          walletId,
          type: input.type,
          credits: input.amount,
          expiresAt: input.expiresAt ?? null,
          sourceRef: input.sourceRef ?? null,
        })
        .returning();
      bucketId = created.id;
    }

    const previous = await ledgerSumTx(tx, walletId);
    const balanceAfter = previous + input.amount;
    await tx.insert(walletTransactions).values({
      walletId,
      userId,
      type: typeForGrant(input.type),
      amount: input.amount,
      balanceAfter,
      bucketType: input.type,
      reference: input.reference ?? null,
      metadata: { bucketId, ...input.metadata },
    });

    return { bucketId, balanceAfter };
  });
}

function typeForGrant(bucketType: BucketType) {
  switch (bucketType) {
    case "daily_free":
      return "daily_grant" as const;
    case "subscription":
      return "subscription_grant" as const;
    case "promotional":
      return "promotional_grant" as const;
    case "purchased":
      return "purchase" as const;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Administrative debit (spec §15): removes credits following the normal
 * consumption order and records `admin_deduct` ledger rows, so the ledger
 * invariant (SUM(amount) == SUM(bucket credits)) stays intact. The caller
 * (actions/admin.ts) writes the audit entry.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  reference: string | null,
  metadata?: Record<string, unknown>,
): Promise<{ allocations: DebitAllocation[]; balanceAfter: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Deduction amount must be a positive integer");
  }
  const settings = await getSettings();
  const wallet = await getOrCreateWallet(userId);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('wallet:' || ${wallet.id}))`);
    const bucketRows = await tx
      .select()
      .from(walletBuckets)
      .where(
        and(
          eq(walletBuckets.walletId, wallet.id),
          or(isNull(walletBuckets.expiresAt), gt(walletBuckets.expiresAt, sql`now()`)),
          sql`${walletBuckets.credits} > 0`,
        ),
      )
      .for("update");

    const views: BucketView[] = bucketRows.map((b) => ({
      id: b.id,
      type: b.type,
      credits: Number(b.credits),
      expiresAt: b.expiresAt,
      createdAt: b.createdAt,
    }));

    const plan = planDebit(views, amount, settings.consumptionOrder);
    if (plan.shortfall > 0) {
      const available = views.reduce((acc, b) => acc + b.credits, 0);
      throw new InsufficientCreditsError(available, amount);
    }

    for (const allocation of plan.allocations) {
      await tx
        .update(walletBuckets)
        .set({
          credits: sql`${walletBuckets.credits} - ${allocation.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(walletBuckets.id, allocation.bucketId));
    }

    const previous = await ledgerSumTx(tx, wallet.id);
    let running = previous;
    for (const allocation of plan.allocations) {
      running -= allocation.amount;
      await tx.insert(walletTransactions).values({
        walletId: wallet.id,
        userId,
        type: "admin_deduct",
        amount: -allocation.amount,
        balanceAfter: running,
        bucketType: allocation.bucketType,
        reference,
        metadata,
      });
    }

    return { allocations: plan.allocations, balanceAfter: running };
  });
}

async function ledgerSumTx(tx: Tx, walletId: string): Promise<number> {
  const [row] = await tx
    .select({ sum: sql<string>`COALESCE(SUM(${walletTransactions.amount}), 0)` })
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, walletId));
  return Number(row.sum);
}

// ---------------------------------------------------------------------------
// Daily free allowance
// ---------------------------------------------------------------------------

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function endOfUtcDay(now: Date): Date {
  return new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Which plan governs this user's daily allowance (subscription plan, else free). */
async function resolvePlanForUser(userId: string) {
  const [sub] = await db
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const planId = sub?.planId ?? "free";
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  return plan ?? null;
}

/**
 * Grants today's daily free credits once per UTC day. Advisory-lock guarded,
 * safe to call on every dashboard render.
 */
export async function ensureDailyGrant(userId: string): Promise<{ granted: number } | { granted: 0; reason: "already_granted" | "plan_none" }> {
  const plan = await resolvePlanForUser(userId);
  if (!plan || plan.dailyFreeCredits <= 0) return { granted: 0, reason: "plan_none" };

  const wallet = await getOrCreateWallet(userId);
  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const expiresAt = endOfUtcDay(now);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('daily:' || ${wallet.id}))`);
    const [already] = await tx
      .select({ id: walletTransactions.id })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, wallet.id),
          eq(walletTransactions.type, "daily_grant"),
          sql`${walletTransactions.createdAt} >= ${dayStart.toISOString()}`,
        ),
      )
      .limit(1);
    if (already) return { granted: 0, reason: "already_granted" as const };

    const amount = Number(plan.dailyFreeCredits);
    const [bucket] = await tx
      .insert(walletBuckets)
      .values({ walletId: wallet.id, type: "daily_free", credits: amount, expiresAt })
      .returning();

    const previous = await ledgerSumTx(tx, wallet.id);
    await tx.insert(walletTransactions).values({
      walletId: wallet.id,
      userId,
      type: "daily_grant",
      amount,
      balanceAfter: previous + amount,
      bucketType: "daily_free",
      reference: `daily:${dayStart.toISOString().slice(0, 10)}`,
      metadata: { planId: plan.id, bucketId: bucket.id },
    });

    return { granted: amount };
  });
}

// ---------------------------------------------------------------------------
// Reserve / commit / release (spec §6 request lifecycle)
// ---------------------------------------------------------------------------

export interface ReserveInput {
  userId: string;
  estimatedCredits: number;
  /** Unique per billable request (e.g. chat request id). */
  idempotencyKey: string;
  reference?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReserveResult {
  reservationId: string;
  allocated: DebitAllocation[];
}

/**
 * Reserves credits atomically: locks the wallet's buckets, debits the
 * estimate, and records a `held` reservation. Throws InsufficientCreditsError
 * (carrying the available balance) instead of ever allowing a negative.
 * Re-calling with the same idempotencyKey returns the original reservation
 * instead of double-debiting.
 */
export async function reserveCredits(input: ReserveInput): Promise<ReserveResult> {
  if (!Number.isInteger(input.estimatedCredits) || input.estimatedCredits <= 0) {
    throw new Error("estimatedCredits must be a positive integer");
  }
  const settings = await getSettings();
  const wallet = await getOrCreateWallet(input.userId);

  return db.transaction(async (tx) => {
    // Idempotency: an existing reservation with this key wins.
    const [existing] = await tx
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      if (existing.status !== "held") {
        throw new ReservationStateError(
          `Reservation for ${input.idempotencyKey} is already ${existing.status}`,
        );
      }
      return { reservationId: existing.id, allocated: existing.breakdown ?? [] };
    }

    // Lock this wallet's spendable buckets (row-level, spec §6 step 2).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('wallet:' || ${wallet.id}))`);
    const bucketRows = await tx
      .select()
      .from(walletBuckets)
      .where(
        and(
          eq(walletBuckets.walletId, wallet.id),
          or(isNull(walletBuckets.expiresAt), gt(walletBuckets.expiresAt, sql`now()`)),
          sql`${walletBuckets.credits} > 0`,
        ),
      )
      .for("update");

    const views: BucketView[] = bucketRows.map((b) => ({
      id: b.id,
      type: b.type,
      credits: Number(b.credits),
      expiresAt: b.expiresAt,
      createdAt: b.createdAt,
    }));

    const plan = planDebit(views, input.estimatedCredits, settings.consumptionOrder);
    if (plan.shortfall > 0) {
      const available = views.reduce((acc, b) => acc + b.credits, 0);
      throw new InsufficientCreditsError(available, input.estimatedCredits);
    }

    // Apply bucket debits.
    for (const allocation of plan.allocations) {
      await tx
        .update(walletBuckets)
        .set({
          credits: sql`${walletBuckets.credits} - ${allocation.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(walletBuckets.id, allocation.bucketId));
    }

    const previous = await ledgerSumTx(tx, wallet.id);
    let running = previous;
    for (const allocation of plan.allocations) {
      running -= allocation.amount;
      await tx.insert(walletTransactions).values({
        walletId: wallet.id,
        userId: input.userId,
        type: "reservation_hold",
        amount: -allocation.amount,
        balanceAfter: running,
        bucketType: allocation.bucketType,
        reference: input.idempotencyKey,
        metadata: { ...input.metadata },
      });
    }

    const expiresAt = new Date(Date.now() + settings.reservationTtlMinutes * 60_000);
    const [reservation] = await tx
      .insert(creditReservations)
      .values({
        userId: input.userId,
        walletId: wallet.id,
        estimatedCredits: input.estimatedCredits,
        status: "held",
        idempotencyKey: input.idempotencyKey,
        breakdown: plan.allocations.map((a) => ({
          bucketId: a.bucketId,
          bucketType: a.bucketType,
          amount: a.amount,
        })),
        expiresAt,
      })
      .returning();

    return { reservationId: reservation.id, allocated: plan.allocations };
  });
}

export interface SettleResult {
  reservationId: string;
  charged: number;
  released: number;
  status: "committed" | "released";
}

/**
 * Commits actual usage: releases the unused portion of the hold back to the
 * originating buckets and finalizes the reservation. `actual` is capped at
 * the estimate — the worst-case reserve guarantees no negative balance even
 * if a provider reports more usage than estimated (capped overage is flagged
 * in reservation metadata for the reconciler).
 */
export async function commitReservation(
  reservationId: string,
  actualCredits: number,
): Promise<SettleResult> {
  if (!Number.isInteger(actualCredits) || actualCredits < 0) {
    throw new Error("actualCredits must be a non-negative integer");
  }
  const { consumptionOrder } = await getSettings();
  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, reservationId))
      .for("update");
    if (!reservation) throw new ReservationStateError("Reservation not found");
    if (reservation.status === "committed") {
      return {
        reservationId: reservation.id,
        charged: Number(reservation.actualCredits ?? 0),
        released: 0,
        status: "committed" as const,
      };
    }
    if (reservation.status !== "held") {
      throw new ReservationStateError(`Reservation is ${reservation.status}, cannot commit`);
    }

    const estimated = Number(reservation.estimatedCredits);
    const charged = Math.min(actualCredits, estimated);
    const released = estimated - charged;
    const breakdown = reservation.breakdown ?? [];

    if (released > 0) {
      const bucketRows = await tx
        .select()
        .from(walletBuckets)
        .where(eq(walletBuckets.walletId, reservation.walletId))
        .for("update");
      const views: BucketView[] = bucketRows.map((b) => ({
        id: b.id,
        type: b.type,
        credits: Number(b.credits),
        expiresAt: b.expiresAt,
        createdAt: b.createdAt,
      }));

      const refundPlan = planRefund(breakdown, released, views, consumptionOrder);

      for (const allocation of refundPlan.allocations) {
        await tx
          .update(walletBuckets)
          .set({
            credits: sql`${walletBuckets.credits} + ${allocation.amount}`,
            updatedAt: new Date(),
          })
          .where(eq(walletBuckets.id, allocation.bucketId));
      }
      if (refundPlan.fallbackAmount > 0 && refundPlan.fallbackType) {
        // Originating bucket vanished mid-flight: place the remainder in a
        // bucket of the lowest-priority type (never lost, never negative).
        const [target] = await tx
          .select()
          .from(walletBuckets)
          .where(
            and(
              eq(walletBuckets.walletId, reservation.walletId),
              eq(walletBuckets.type, refundPlan.fallbackType),
            ),
          )
          .limit(1);
        if (target) {
          await tx
            .update(walletBuckets)
            .set({ credits: Number(target.credits) + refundPlan.fallbackAmount, updatedAt: new Date() })
            .where(eq(walletBuckets.id, target.id));
        } else {
          await tx.insert(walletBuckets).values({
            walletId: reservation.walletId,
            type: refundPlan.fallbackType,
            credits: refundPlan.fallbackAmount,
          });
        }
      }

      const previous = await ledgerSumTx(tx, reservation.walletId);
      let running = previous;
      for (const allocation of refundPlan.allocations) {
        running += allocation.amount;
        await tx.insert(walletTransactions).values({
          walletId: reservation.walletId,
          userId: reservation.userId,
          type: "reservation_release",
          amount: allocation.amount,
          balanceAfter: running,
          bucketType: allocation.bucketType,
          reservationId: reservation.id,
          metadata: { reason: "commit_unused" },
        });
      }
      if (refundPlan.fallbackAmount > 0 && refundPlan.fallbackType) {
        running += refundPlan.fallbackAmount;
        await tx.insert(walletTransactions).values({
          walletId: reservation.walletId,
          userId: reservation.userId,
          type: "reservation_release",
          amount: refundPlan.fallbackAmount,
          balanceAfter: running,
          bucketType: refundPlan.fallbackType,
          reservationId: reservation.id,
          metadata: { reason: "commit_unused_fallback" },
        });
      }
    }

    await tx
      .update(creditReservations)
      .set({ status: "committed", actualCredits: charged, settledAt: new Date() })
      .where(eq(creditReservations.id, reservation.id));

    return { reservationId: reservation.id, charged, released, status: "committed" as const };
  });
}

/** Full refund of a held reservation (provider failure / abort). */
export async function releaseReservation(
  reservationId: string,
  reason: string,
): Promise<SettleResult> {
  const { consumptionOrder } = await getSettings();
  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, reservationId))
      .for("update");
    if (!reservation) throw new ReservationStateError("Reservation not found");
    if (reservation.status === "released") {
      return { reservationId: reservation.id, charged: 0, released: 0, status: "released" as const };
    }
    if (reservation.status !== "held") {
      throw new ReservationStateError(`Reservation is ${reservation.status}, cannot release`);
    }

    const estimated = Number(reservation.estimatedCredits);
    const breakdown = reservation.breakdown ?? [];

    const bucketRows = await tx
      .select()
      .from(walletBuckets)
      .where(eq(walletBuckets.walletId, reservation.walletId))
      .for("update");
    const views: BucketView[] = bucketRows.map((b) => ({
      id: b.id,
      type: b.type,
      credits: Number(b.credits),
      expiresAt: b.expiresAt,
      createdAt: b.createdAt,
    }));

    const refundPlan = planRefund(breakdown, estimated, views, consumptionOrder);

    for (const allocation of refundPlan.allocations) {
      await tx
        .update(walletBuckets)
        .set({
          credits: sql`${walletBuckets.credits} + ${allocation.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(walletBuckets.id, allocation.bucketId));
    }
    if (refundPlan.fallbackAmount > 0 && refundPlan.fallbackType) {
      const [target] = await tx
        .select()
        .from(walletBuckets)
        .where(
          and(
            eq(walletBuckets.walletId, reservation.walletId),
            eq(walletBuckets.type, refundPlan.fallbackType),
          ),
        )
        .limit(1);
      if (target) {
        await tx
          .update(walletBuckets)
          .set({ credits: Number(target.credits) + refundPlan.fallbackAmount, updatedAt: new Date() })
          .where(eq(walletBuckets.id, target.id));
      } else {
        await tx.insert(walletBuckets).values({
          walletId: reservation.walletId,
          type: refundPlan.fallbackType,
          credits: refundPlan.fallbackAmount,
        });
      }
    }

    const previous = await ledgerSumTx(tx, reservation.walletId);
    let running = previous;
    for (const allocation of refundPlan.allocations) {
      running += allocation.amount;
      await tx.insert(walletTransactions).values({
        walletId: reservation.walletId,
        userId: reservation.userId,
        type: "reservation_release",
        amount: allocation.amount,
        balanceAfter: running,
        bucketType: allocation.bucketType,
        reservationId: reservation.id,
        metadata: { reason },
      });
    }
    if (refundPlan.fallbackAmount > 0 && refundPlan.fallbackType) {
      running += refundPlan.fallbackAmount;
      await tx.insert(walletTransactions).values({
        walletId: reservation.walletId,
        userId: reservation.userId,
        type: "reservation_release",
        amount: refundPlan.fallbackAmount,
        balanceAfter: running,
        bucketType: refundPlan.fallbackType,
        reservationId: reservation.id,
        metadata: { reason: `${reason}_fallback` },
      });
    }

    await tx
      .update(creditReservations)
      .set({ status: "released", actualCredits: 0, settledAt: new Date() })
      .where(eq(creditReservations.id, reservation.id));

    return { reservationId: reservation.id, charged: 0, released: estimated, status: "released" as const };
  });
}

// ---------------------------------------------------------------------------
// Maintenance (spec §6 step 7 reconciler)
// ---------------------------------------------------------------------------

/** Releases reservations that were held longer than their TTL. */
export async function expireStaleReservations(): Promise<number> {
  const stale = await db
    .select({ id: creditReservations.id })
    .from(creditReservations)
    .where(and(eq(creditReservations.status, "held"), lt(creditReservations.expiresAt, new Date())))
    .limit(200);
  let count = 0;
  for (const row of stale) {
    try {
      await releaseReservation(row.id, "expired_by_reconciler");
      count += 1;
    } catch (err) {
      console.error(`[wallet] failed to expire reservation ${row.id}:`, err);
    }
  }
  return count;
}

/** Zeroes expired buckets, writing matching `expiry` ledger rows. */
export async function expireBuckets(): Promise<number> {
  return db.transaction(async (tx) => {
    const expired = await tx
      .select({
        id: walletBuckets.id,
        walletId: walletBuckets.walletId,
        type: walletBuckets.type,
        credits: walletBuckets.credits,
        userId: wallets.userId,
      })
      .from(walletBuckets)
      .innerJoin(wallets, eq(wallets.id, walletBuckets.walletId))
      .where(
        and(
          sql`${walletBuckets.credits} > 0`,
          sql`${walletBuckets.expiresAt} IS NOT NULL`,
          lt(walletBuckets.expiresAt, new Date()),
        ),
      )
      .for("update", { skipLocked: true })
      .limit(500);

    let total = 0;
    for (const bucket of expired) {
      const credits = Number(bucket.credits);
      total += credits;
      await tx
        .update(walletBuckets)
        .set({ credits: 0, updatedAt: new Date() })
        .where(eq(walletBuckets.id, bucket.id));

      const previous = await ledgerSumTx(tx, bucket.walletId);
      await tx.insert(walletTransactions).values({
        walletId: bucket.walletId,
        userId: bucket.userId,
        type: "expiry",
        amount: -credits,
        balanceAfter: previous - credits,
        bucketType: bucket.type,
        reference: `bucket:${bucket.id}`,
        metadata: { expiredAt: new Date().toISOString() },
      });
    }
    return total;
  });
}

// ---------------------------------------------------------------------------
// Verification + history
// ---------------------------------------------------------------------------

/** Ledger invariant check (spec §5: balances derived/verified from ledger). */
export async function verifyLedger(
  walletId: string,
): Promise<{ ok: boolean; ledgerSum: number; bucketSum: number }> {
  const ledgerTotal = await ledgerSum(walletId);
  const [bucketRow] = await db
    .select({ sum: sql<string>`COALESCE(SUM(${walletBuckets.credits}), 0)` })
    .from(walletBuckets)
    .where(eq(walletBuckets.walletId, walletId));
  const bucketSum = Number(bucketRow.sum);
  return { ok: ledgerTotal === bucketSum, ledgerSum: ledgerTotal, bucketSum };
}

export async function listTransactions(userId: string, limit = 50) {
  return db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(Math.min(limit, 200));
}

export async function getHeldTotal(walletId: string): Promise<number> {
  const [row] = await db
    .select({ sum: sql<string>`COALESCE(SUM(${creditReservations.estimatedCredits}), 0)` })
    .from(creditReservations)
    .where(and(eq(creditReservations.walletId, walletId), eq(creditReservations.status, "held")));
  return Number(row.sum);
}
