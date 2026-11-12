import "server-only";
import { db } from "@/db";
import { authTokens, users, userRoles, type User } from "@/db/schema";
import { hashPassword, verifyPassword, generateToken, hashToken } from "@/lib/crypto/password";
import {
  base32Encode,
  encryptString,
  decryptString,
  generateSecret,
  totpUri,
  verifyTotp,
} from "@/lib/crypto/totp";
import { createSession, destroyAllSessions } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { sendEmail, renderAuthEmail } from "@/lib/mailer";
import { getOrCreateWallet } from "@/lib/wallet";
import { claimReferralCode } from "@/lib/referrals";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { headers } from "next/headers";

/**
 * Auth flows: password reset and optional TOTP 2FA. New accounts are active
 * immediately without email confirmation. Legacy verification tokens remain
 * supported for links that were issued before confirmation was disabled.
 */

export const EMAIL_VERIFY_TTL_MINUTES = 60 * 24;
export const PASSWORD_RESET_TTL_MINUTES = 60;

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function buildLinkUrl(path: string): Promise<string> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}

async function createAuthToken(
  userId: string,
  type: "email_verify" | "password_reset",
  ttlMinutes: number,
): Promise<string> {
  // Invalidate previous unconsumed tokens of this type.
  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.type, type),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    );

  const token = generateToken(32);
  await db.insert(authTokens).values({
    userId,
    type,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  });
  return token;
}

async function consumeAuthToken(
  token: string,
  type: "email_verify" | "password_reset",
): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.type, type),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;

  // Single-use: consume first, then let the caller act.
  const updated = await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(authTokens.id, row.id), isNull(authTokens.consumedAt)))
    .returning({ id: authTokens.id });
  if (updated.length === 0) return null;
  return { userId: row.userId };
}

// ---------------------------------------------------------------------------
// Registration (email confirmation disabled) + legacy verification
// ---------------------------------------------------------------------------

export async function registerUser(
  email: string,
  name: string,
  password: string,
  referralCode?: string,
): Promise<User> {
  const normalized = email.trim().toLowerCase();
  const [existing] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, normalized), and(isNull(users.deletedAt), eq(users.email, normalized))))
    .limit(1);
  if (existing && !existing.deletedAt) {
    // Keep the registration response generic without issuing verification mail.
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: normalized,
      name: name.trim(),
      passwordHash: hashPassword(password),
      emailVerifiedAt: new Date(),
      referralCode: `NX-${generateToken(9).replace(/[-_]/g, "").slice(0, 12).toUpperCase()}`,
    })
    .returning();

  await db.insert(userRoles).values({ userId: created.id, roleName: "user" }).onConflictDoNothing();
  await getOrCreateWallet(created.id);
  if (referralCode?.trim()) {
    try {
      const referral = await claimReferralCode(created.id, referralCode);
      if (!referral.ok) console.info("[referrals] invite code not applied during registration:", referral.error);
    } catch (error) {
      console.error("[referrals] could not apply invite code during registration", error);
    }
  }
  await writeAudit({
    actorUserId: created.id,
    action: "auth.register",
    entityType: "user",
    entityId: created.id,
    ip: await clientIp(),
  });

  return created;
}

async function sendVerificationEmail(user: User): Promise<boolean> {
  if (user.emailVerifiedAt) return false;
  const token = await createAuthToken(user.id, "email_verify", EMAIL_VERIFY_TTL_MINUTES);
  const url = await buildLinkUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  const { subject, text } = renderAuthEmail({
    action: "verify-email",
    url,
    expiresInMinutes: EMAIL_VERIFY_TTL_MINUTES,
  });
  await sendEmail({ to: user.email, subject, text });
  return true;
}

export async function resendVerification(email: string): Promise<boolean> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.trim().toLowerCase()), isNull(users.deletedAt)))
    .limit(1);
  if (!user || user.emailVerifiedAt) return false;
  return sendVerificationEmail(user);
}

export async function verifyEmailByToken(token: string): Promise<boolean> {
  const consumed = await consumeAuthToken(token, "email_verify");
  if (!consumed) return false;
  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, consumed.userId), isNull(users.emailVerifiedAt)))
    .returning();
  if (!user) return false;
  await writeAudit({
    actorUserId: user.id,
    action: "auth.email_verified",
    entityType: "user",
    entityId: user.id,
    ip: await clientIp(),
  });
  return true;
}

// ---------------------------------------------------------------------------
// Login (password + optional TOTP step)
// ---------------------------------------------------------------------------

export type AuthenticateResult =
  | { ok: true; user: User }
  | { error: "invalid_credentials" }
  | { error: "suspended" }
  | { needsTotp: true };

/**
 * Two-step login for 2FA users: first call without a code returns
 * { needsTotp: true } (the password has been verified, but no session is
 * created until a valid TOTP code is supplied — the form resubmits the same
 * credentials plus the code, so no server-side pending state exists).
 */
export async function authenticate(
  email: string,
  password: string,
  totpCode?: string,
): Promise<AuthenticateResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.trim().toLowerCase()), isNull(users.deletedAt)))
    .limit(1);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "invalid_credentials" };
  }
  if (user.status === "suspended") return { error: "suspended" };
  if (user.totpEnabled) {
    if (!totpCode) return { needsTotp: true };
    const secret = await loadTotpSecret(user.id);
    if (!secret || !verifyTotp(secret, totpCode)) {
      return { error: "invalid_credentials" };
    }
  }

  await createSession(user.id);
  await writeAudit({
    actorUserId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    ip: await clientIp(),
  });
  return { ok: true, user };
}

// ---------------------------------------------------------------------------
// Password reset + change
// ---------------------------------------------------------------------------

/** Always returns true — never leaks whether the account exists. */
export async function requestPasswordReset(email: string): Promise<boolean> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.trim().toLowerCase()), isNull(users.deletedAt)))
    .limit(1);
  if (!user) {
    // Pretend success: responding differently would reveal whether the
    // account exists (spec §16). The action layer always shows the same copy.
    return true;
  }
  const token = await createAuthToken(user.id, "password_reset", PASSWORD_RESET_TTL_MINUTES);
  const url = await buildLinkUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const { subject, text } = renderAuthEmail({
    action: "reset-password",
    url,
    expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
  });
  await sendEmail({ to: user.email, subject, text });
  await writeAudit({
    actorUserId: user.id,
    action: "auth.password_reset_requested",
    entityType: "user",
    entityId: user.id,
    ip: await clientIp(),
  });
  return true;
}

export async function resetPasswordByToken(
  token: string,
  newPassword: string,
): Promise<boolean> {
  const consumed = await consumeAuthToken(token, "password_reset");
  if (!consumed) return false;
  await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, consumed.userId));
  // Any stolen session dies with the old password.
  await destroyAllSessions(consumed.userId);
  await writeAudit({
    actorUserId: consumed.userId,
    action: "auth.password_reset",
    entityType: "user",
    entityId: consumed.userId,
    ip: await clientIp(),
  });
  return true;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<"ok" | "wrong_password"> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return "wrong_password";
  }
  await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId));
  await writeAudit({
    actorUserId: userId,
    action: "auth.password_changed",
    entityType: "user",
    entityId: userId,
    ip: await clientIp(),
  });
  return "ok";
}

// ---------------------------------------------------------------------------
// TOTP 2FA (optional)
// ---------------------------------------------------------------------------

export interface TotpSetup {
  secretBase32: string;
  uri: string;
}

/** Generates + stores (encrypted) a pending secret; not trusted until confirmed. */
export async function initiateTotpSetup(userId: string, email: string): Promise<TotpSetup> {
  const secret = generateSecret();
  const secretBase32 = base32Encode(secret);
  const envelope = encryptString(secret.toString("base64"));
  await db
    .update(users)
    .set({
      totpSecretEnc: envelope.ciphertext,
      totpIv: envelope.iv,
      totpAuthTag: envelope.authTag,
      totpEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await writeAudit({ actorUserId: userId, action: "auth.totp_setup_started", entityType: "user", entityId: userId });
  return { secretBase32, uri: totpUri(secretBase32, email) };
}

export async function confirmTotpSetup(
  userId: string,
  code: string,
): Promise<"ok" | "invalid_code"> {
  const secret = await loadTotpSecret(userId);
  if (!secret) return "invalid_code";
  if (!verifyTotp(secret, code)) return "invalid_code";
  await db
    .update(users)
    .set({ totpEnabled: true, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await writeAudit({ actorUserId: userId, action: "auth.totp_enabled", entityType: "user", entityId: userId });
  return "ok";
}

export async function disableTotp(
  userId: string,
  password: string,
  code: string,
): Promise<"ok" | "wrong_password" | "invalid_code"> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) return "wrong_password";
  const secret = user.totpSecretEnc
    ? await loadTotpSecret(userId)
    : null;
  if (user.totpEnabled) {
    if (!secret || !verifyTotp(secret, code)) return "invalid_code";
  }
  await db
    .update(users)
    .set({
      totpEnabled: false,
      totpSecretEnc: null,
      totpIv: null,
      totpAuthTag: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await writeAudit({ actorUserId: userId, action: "auth.totp_disabled", entityType: "user", entityId: userId });
  return "ok";
}

async function loadTotpSecret(userId: string): Promise<Buffer | null> {
  const [user] = await db
    .select({
      totpSecretEnc: users.totpSecretEnc,
      totpIv: users.totpIv,
      totpAuthTag: users.totpAuthTag,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.totpSecretEnc || !user.totpIv || !user.totpAuthTag) return null;
  const secretB64 = decryptString({
    ciphertext: user.totpSecretEnc,
    iv: user.totpIv,
    authTag: user.totpAuthTag,
  });
  return Buffer.from(secretB64, "base64");
}
