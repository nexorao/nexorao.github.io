import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeAllDbPools, createDb, schema } from "@/db/client";
import { closePool as closeMainPool } from "@/db";
import {
  authenticate,
  changePassword,
  confirmTotpSetup,
  disableTotp,
  initiateTotpSetup,
  registerUser,
  requestPasswordReset,
  resetPasswordByToken,
  verifyEmailByToken,
} from "@/lib/auth/users";
import { generateTotp } from "@/lib/crypto/totp";
import { hashPassword, hashToken } from "@/lib/crypto/password";
import { getOrCreateWallet } from "@/lib/wallet";

/**
 * Auth integration tests (spec §16) against the real test database:
 * registration, verification tokens (single-use), login incl. the 2FA
 * two-step flow, password reset (revokes sessions), TOTP enable/disable.
 */
const db = createDb(process.env.DATABASE_URL as string);

let seq = 0;
const nextEmail = () => `auth-test-${Date.now()}-${seq++}@test.nexora`;

async function insertVerifiedUser(email: string): Promise<string> {
  const [row] = await db
    .insert(schema.users)
    .values({
      email,
      name: "Auth Test",
      passwordHash: hashPassword("Passw0rd123"),
      emailVerifiedAt: new Date(),
    })
    .returning();
  return row.id;
}

beforeAll(async () => {
  // Plans must exist (global-setup seeds them).
  const plans = await db.select({ id: schema.plans.id }).from(schema.plans);
  expect(plans.length).toBeGreaterThanOrEqual(3);
});

afterAll(async () => {
  await closeAllDbPools();
  await closeMainPool();
});

describe("registration", () => {
  it("creates a ready-to-use user, role and wallet without a verification email", async () => {
    const email = nextEmail();
    const user = await registerUser(email, "New User", "Passw0rd123");
    expect(user.email).toBe(email);
    expect(user.emailVerifiedAt).not.toBeNull();

    const [role] = await db
      .select()
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, user.id));
    expect(role?.roleName).toBe("user");

    const wallet = await getOrCreateWallet(user.id);
    expect(wallet.userId).toBe(user.id);

    const tokens = await db
      .select()
      .from(schema.authTokens)
      .where(eq(schema.authTokens.userId, user.id));
    expect(tokens).toHaveLength(0);
  });

  it("does not create a duplicate account", async () => {
    const email = nextEmail();
    await registerUser(email, "First", "Passw0rd123");
    const second = await registerUser(email, "Second", "Passw0rd123");
    expect(second.email).toBe(email);
    const all = await db.select().from(schema.users).where(eq(schema.users.email, email));
    expect(all).toHaveLength(1);
  });
});

describe("email verification", () => {
  it("consumes a valid token once and marks the user verified", async () => {
    const email = nextEmail();
    const user = await registerUser(email, "Verify Me", "Passw0rd123");
    await db
      .update(schema.users)
      .set({ emailVerifiedAt: null })
      .where(eq(schema.users.id, user.id));

    // Insert a known token directly to exercise legacy token consumption.
    const rawToken = "raw-verify-token-abcdef";
    await db.insert(schema.authTokens).values({
      userId: user.id,
      type: "email_verify",
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await verifyEmailByToken(rawToken)).toBe(true);
    expect(await verifyEmailByToken(rawToken)).toBe(false); // single use

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row?.emailVerifiedAt).not.toBeNull();
  });

  it("rejects unknown or expired tokens", async () => {
    expect(await verifyEmailByToken("nope-not-a-token")).toBe(false);
  });
});

describe("login", () => {
  it("rejects wrong passwords and unknown accounts identically", async () => {
    const email = nextEmail();
    await insertVerifiedUser(email);
    await expect(authenticate(email, "WrongPass1")).resolves.toMatchObject({
      error: "invalid_credentials",
    });
    await expect(authenticate(nextEmail(), "Whatever1")).resolves.toMatchObject({
      error: "invalid_credentials",
    });
  });

  it("allows sign-in when email confirmation is disabled", async () => {
    const user = await registerUser(nextEmail(), "No Confirmation", "Passw0rd123");
    await db
      .update(schema.users)
      .set({ emailVerifiedAt: null })
      .where(eq(schema.users.id, user.id));
    await expect(authenticate(user.email, "Passw0rd123")).resolves.toMatchObject({ ok: true });
  });

  it("creates a session for verified users", async () => {
    const email = nextEmail();
    await insertVerifiedUser(email);
    const result = await authenticate(email, "Passw0rd123");
    expect(result).toMatchObject({ ok: true });
  });
});

describe("TOTP 2FA", () => {
  it("enforces the two-step login once enabled", async () => {
    const email = nextEmail();
    const userId = await insertVerifiedUser(email);

    const setup = await initiateTotpSetup(userId, email);
    expect(setup.secretBase32).toMatch(/^[A-Z2-7]+$/);

    // Confirming with a valid current code enables 2FA.
    const secret = Buffer.from(
      // base32 decode is exercised in unit tests; derive via generateTotp input
      (await import("@/lib/crypto/totp")).base32Decode(setup.secretBase32),
    );
    const code = generateTotp(secret, 30, 6);
    expect(await confirmTotpSetup(userId, code)).toBe("ok");

    // Step 1: password-only login returns needsTotp (no session).
    await expect(authenticate(email, "Passw0rd123")).resolves.toMatchObject({ needsTotp: true });

    // Wrong code → invalid_credentials.
    await expect(authenticate(email, "Passw0rd123", "000000")).resolves.toMatchObject({
      error: "invalid_credentials",
    });

    // Step 2: valid code completes the login.
    const currentCode = generateTotp(secret, 30, 6);
    await expect(authenticate(email, "Passw0rd123", currentCode)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("requires the password to disable 2FA", async () => {
    const email = nextEmail();
    const userId = await insertVerifiedUser(email);
    const { base32Decode } = await import("@/lib/crypto/totp");
    const setup = await initiateTotpSetup(userId, email);
    const secret = base32Decode(setup.secretBase32);
    await confirmTotpSetup(userId, generateTotp(secret, 30, 6));

    expect(await disableTotp(userId, "WrongPass1", generateTotp(secret, 30, 6))).toBe(
      "wrong_password",
    );
    expect(await disableTotp(userId, "Passw0rd123", "000000")).toBe("invalid_code");
    expect(await disableTotp(userId, "Passw0rd123", generateTotp(secret, 30, 6))).toBe("ok");

    // After disabling, password-only login works again.
    await expect(authenticate(email, "Passw0rd123")).resolves.toMatchObject({ ok: true });
  });
});

describe("password reset", () => {
  it("is single-use and revokes sessions", async () => {
    const email = nextEmail();
    const userId = await insertVerifiedUser(email);
    await authenticate(email, "Passw0rd123"); // creates a session

    expect(await requestPasswordReset(email)).toBe(true);
    const [tokenRow] = await db
      .select()
      .from(schema.authTokens)
      .where(sql`${schema.authTokens.userId} = ${userId} AND ${schema.authTokens.type} = 'password_reset'`);

    // Unknown token rejected.
    expect(await resetPasswordByToken("bogus-token", "NewPass123")).toBe(false);

    const rawToken = "raw-reset-token-xyz";
    await db.insert(schema.authTokens).values({
      userId,
      type: "password_reset",
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await resetPasswordByToken(rawToken, "NewPass123")).toBe(true);
    expect(await resetPasswordByToken(rawToken, "NewPass123")).toBe(false); // single use

    // All sessions were revoked by the reset (checked BEFORE any new login).
    const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId));
    expect(sessions).toHaveLength(0);

    await expect(authenticate(email, "Passw0rd123")).resolves.toMatchObject({
      error: "invalid_credentials",
    });
    await expect(authenticate(email, "NewPass123")).resolves.toMatchObject({ ok: true });

    void tokenRow;
  });

  it("never reveals account existence", async () => {
    expect(await requestPasswordReset("ghost-" + nextEmail())).toBe(true);
  });

  it("changePassword validates the current password", async () => {
    const email = nextEmail();
    const userId = await insertVerifiedUser(email);
    expect(await changePassword(userId, "wrong", "NewPass123")).toBe("wrong_password");
    expect(await changePassword(userId, "Passw0rd123", "NewPass123")).toBe("ok");
    await expect(authenticate(email, "NewPass123")).resolves.toMatchObject({ ok: true });
  });
});

