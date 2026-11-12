import "server-only";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { referrals, users, walletBuckets, walletTransactions, wallets } from "@/db/schema";
import { generateToken } from "@/lib/crypto/password";

function newReferralCode() {
  return `NX-${generateToken(9).replace(/[-_]/g, "").slice(0, 12).toUpperCase()}`;
}

export async function ensureReferralCode(userId: string) {
  const [user] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found.");
  if (user.code) return user.code;
  for (let attempt = 0; attempt < 3; attempt++) {
    const [updated] = await db.update(users).set({ referralCode: newReferralCode() }).where(and(eq(users.id, userId), isNull(users.referralCode))).returning({ code: users.referralCode });
    if (updated?.code) return updated.code;
    const [raced] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
    if (raced?.code) return raced.code;
  }
  throw new Error("Could not assign a referral code.");
}

export function referralRewardCredits() {
  const configured = Number(process.env.REFERRAL_REWARD_CREDITS ?? 500);
  return Number.isSafeInteger(configured) && configured >= 0 && configured <= 100_000 ? configured : 500;
}

export async function claimReferralCode(inviteeUserId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase().replace(/\s/g, "");
  if (!/^NX-[A-Z0-9]{8,16}$/.test(code)) return { ok: false as const, error: "Enter a valid NEXORA invite code." };

  return db.transaction(async (tx) => {
    const [invitee] = await tx.select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, inviteeUserId)).limit(1);
    if (!invitee?.emailVerifiedAt) return { ok: false as const, error: "Verify your email before using a referral code." };
    const [inviter] = await tx.select({ id: users.id, referralCode: users.referralCode }).from(users).where(eq(users.referralCode, code)).limit(1);
    if (!inviter) return { ok: false as const, error: "That invite code was not found." };
    if (inviter.id === inviteeUserId) return { ok: false as const, error: "You cannot use your own invite code." };
    const [existing] = await tx.select({ id: referrals.id }).from(referrals).where(eq(referrals.inviteeUserId, inviteeUserId)).limit(1);
    if (existing) return { ok: false as const, error: "An invite code has already been applied to this account." };
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const [count] = await tx.select({ total: sql<string>`count(*)` }).from(referrals).where(and(eq(referrals.inviterUserId, inviter.id), gte(referrals.createdAt, monthStart)));
    if (Number(count.total) >= 20) return { ok: false as const, error: "This account has reached its monthly referral limit." };

    const rewardCredits = referralRewardCredits();
    const now = new Date();
    const [referral] = await tx.insert(referrals).values({
      inviterUserId: inviter.id, inviteeUserId, code, status: rewardCredits > 0 ? "rewarded" : "verified",
      rewardCredits, rewardedAt: rewardCredits > 0 ? now : null,
    }).returning({ id: referrals.id });
    if (rewardCredits > 0) {
      const ids = [inviter.id, inviteeUserId].sort();
      for (const userId of ids) await tx.insert(wallets).values({ userId }).onConflictDoNothing();
      const walletRows = await tx.select({ id: wallets.id, userId: wallets.userId }).from(wallets).where(sql`${wallets.userId} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
      const walletByUser = new Map(walletRows.map((wallet) => [wallet.userId, wallet.id]));
      for (const userId of ids) {
        const walletId = walletByUser.get(userId);
        if (!walletId) throw new Error("Could not load referral wallet.");
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('wallet:' || ${walletId}))`);
        const [existingBucket] = await tx.select({ id: walletBuckets.id, credits: walletBuckets.credits }).from(walletBuckets)
          .where(and(eq(walletBuckets.walletId, walletId), eq(walletBuckets.type, "promotional"), eq(walletBuckets.sourceRef, referral.id))).limit(1).for("update");
        let bucketId = existingBucket?.id;
        if (existingBucket) {
          await tx.update(walletBuckets).set({ credits: Number(existingBucket.credits) + rewardCredits, updatedAt: now }).where(eq(walletBuckets.id, existingBucket.id));
        } else {
          const [bucket] = await tx.insert(walletBuckets).values({ walletId, type: "promotional", credits: rewardCredits, sourceRef: referral.id }).returning({ id: walletBuckets.id });
          bucketId = bucket.id;
        }
        const [ledger] = await tx.select({ balance: sql<string>`coalesce(sum(${walletTransactions.amount}), 0)` }).from(walletTransactions).where(eq(walletTransactions.walletId, walletId));
        await tx.insert(walletTransactions).values({
          walletId, userId, type: "promotional_grant", amount: rewardCredits,
          balanceAfter: Number(ledger.balance) + rewardCredits, bucketType: "promotional",
          reference: `referral:${referral.id}:${userId}`, metadata: { referralId: referral.id, bucketId, inviterUserId: inviter.id, inviteeUserId },
        });
      }
    }
    return { ok: true as const, credits: rewardCredits, referralId: referral.id };
  });
}

export async function listUserReferrals(userId: string) {
  return db.select({
    id: referrals.id, status: referrals.status, rewardCredits: referrals.rewardCredits,
    createdAt: referrals.createdAt, inviteeName: users.name,
  }).from(referrals).innerJoin(users, eq(users.id, referrals.inviteeUserId))
    .where(eq(referrals.inviterUserId, userId)).orderBy(sql`${referrals.createdAt} desc`).limit(100);
}
