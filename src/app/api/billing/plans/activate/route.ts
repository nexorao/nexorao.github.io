import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans, subscriptions, walletBuckets, walletTransactions } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { periodEndFor } from "@/lib/subscriptions";
import { commitReservation, ensureDailyGrant, getOrCreateWallet, InsufficientCreditsError, releaseReservation, reserveCredits } from "@/lib/wallet";
import { rateLimitAsync } from "@/lib/rate-limit";

const schema = z.object({ planId: z.string().min(1).max(64), billingCycle: z.enum(["monthly", "annual"]), requestKey: z.uuid() });

export async function POST(request: Request) {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to continue." : "Authentication required." }, { status: 401 });
  }
  const limit = await rateLimitAsync(`plan-activate:${user.id}`, 5, 60_000);
  if (!limit.allowed) return Response.json({ error: "Too many plan requests. Try again shortly." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose a valid plan and billing period." }, { status: 400 });
  const [{ planId, billingCycle, requestKey }, settings] = [parsed.data, await getSettings()];
  const [plan] = await db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.active, true))).limit(1);
  if (!plan || plan.pricePaiseMonthly <= 0) return Response.json({ error: "This paid plan is not available." }, { status: 404 });
  const totalPaise = plan.pricePaiseMonthly * (billingCycle === "annual" ? plan.annualMonthsCharged : 1);
  const priceCredits = Math.ceil(totalPaise / Math.max(1, settings.creditValuePaise));
  const periodCredits = Number(plan.monthlyCredits) * (billingCycle === "annual" ? 12 : 1);
  const wallet = await getOrCreateWallet(user.id);
  let reservationId: string;
  try {
    ({ reservationId } = await reserveCredits({ userId: user.id, estimatedCredits: priceCredits, idempotencyKey: `plan:${user.id}:${requestKey}`, metadata: { planId, billingCycle } }));
  } catch (error) {
    if (error instanceof InsufficientCreditsError) return Response.json({ error: "Your balance is too low for this plan.", availableCredits: error.available, requiredCredits: error.required, shortfallCredits: error.required - error.available }, { status: 402 });
    return Response.json({ error: "Could not reserve your balance for this plan." }, { status: 500 });
  }

  try {
    const activated = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('plan-activation:' || ${user.id}))`);
      const [prior] = await tx.select({ id: subscriptions.id }).from(subscriptions).where(and(
        eq(subscriptions.userId, user.id),
        sql`${subscriptions.metadata}->>'activationKey' = ${requestKey}`,
      )).limit(1);
      if (prior) return { id: prior.id };
      const now = new Date();
      const periodEnd = periodEndFor(billingCycle, now);
      const [sub] = await tx.insert(subscriptions).values({
        userId: user.id, planId: plan.id, status: "active", billingCycle,
        currentPeriodStart: now, currentPeriodEnd: periodEnd, source: "wallet",
        metadata: { activationKey: requestKey, priceCredits, pricePaise: totalPaise },
      }).returning({ id: subscriptions.id });
      await tx.update(subscriptions).set({ status: "canceled", updatedAt: now }).where(and(
        eq(subscriptions.userId, user.id), eq(subscriptions.status, "active"),
        sql`${subscriptions.id} <> ${sub.id}`,
      ));
      const carryover = await tx.select({ id: walletBuckets.id }).from(walletBuckets).where(and(
        eq(walletBuckets.walletId, wallet.id), eq(walletBuckets.type, "subscription"), gt(walletBuckets.credits, 0), gt(walletBuckets.expiresAt, now),
      )).for("update");
      for (const bucket of carryover) await tx.update(walletBuckets).set({ expiresAt: periodEnd, updatedAt: now }).where(eq(walletBuckets.id, bucket.id));
      if (periodCredits > 0) {
        await tx.insert(walletBuckets).values({ walletId: wallet.id, type: "subscription", credits: periodCredits, expiresAt: periodEnd, sourceRef: sub.id });
        const [ledger] = await tx.select({ balance: sql<string>`coalesce(sum(${walletTransactions.amount}), 0)` }).from(walletTransactions).where(eq(walletTransactions.walletId, wallet.id));
        await tx.insert(walletTransactions).values({
          walletId: wallet.id, userId: user.id, type: "subscription_grant", amount: periodCredits,
          balanceAfter: Number(ledger.balance) + periodCredits, bucketType: "subscription",
          reference: `subscription:${sub.id}`, metadata: { planId: plan.id, billingCycle, activationKey: requestKey },
        });
      }
      return { id: sub.id };
    });
    await commitReservation(reservationId, priceCredits);
    await ensureDailyGrant(user.id).catch((grantError) => console.error("[billing] daily grant refresh failed after activation", grantError));
    return Response.json({ ok: true, subscriptionId: activated.id, plan: plan.name, billingCycle });
  } catch (error) {
    await releaseReservation(reservationId, "plan_activation_failed").catch((releaseError) => console.error("[billing] failed to release plan reservation", releaseError));
    console.error("[billing] plan activation failed", error);
    return Response.json({ error: "Plan activation could not be completed. Your reserved balance has been returned." }, { status: 500 });
  }
}
