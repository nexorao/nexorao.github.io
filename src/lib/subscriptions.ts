import "server-only";
import { db } from "@/db";
import {
  plans,
  subscriptions,
  type Plan,
  type Subscription,
} from "@/db/schema";
import { getOrCreateWallet, grantCredits } from "@/lib/wallet";
import { and, desc, eq, gt, lt } from "drizzle-orm";

/**
 * Subscription service. Plan entitlements are provisioned after a verified
 * payment or an authorized manual assignment.
 */

export function periodEndFor(cycle: "monthly" | "annual", start: Date): Date {
  const end = new Date(start);
  if (cycle === "monthly") {
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 12);
  }
  return end;
}

export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        gt(subscriptions.currentPeriodEnd, new Date()),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);
  return sub ?? null;
}

export async function getPlan(planId: string): Promise<Plan | null> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  return plan ?? null;
}

export async function listPlans(): Promise<Plan[]> {
  return db.select().from(plans).orderBy(plans.sortOrder);
}

export interface AssignPlanInput {
  userId: string;
  planId: string;
  billingCycle: "monthly" | "annual";
  /** Optional admin note recorded on the subscription row. */
  note?: string;
}

export interface AssignPlanResult {
  subscription: Subscription;
  creditsGranted: number;
}

/**
 * Assigns (or switches) a user's plan and provisions the subscription
 * bucket. A switch replaces the previous active subscription (status
 * `canceled`, no proration) and
 * grants the new plan's monthly credits for the new period.
 */
export async function assignPlan(input: AssignPlanInput): Promise<AssignPlanResult> {
  const plan = await getPlan(input.planId);
  if (!plan) throw new Error(`Unknown plan: ${input.planId}`);
  if (!plan.active) throw new Error(`Plan ${input.planId} is not active`);

  const now = new Date();
  const periodEnd = periodEndFor(input.billingCycle, now);
  const wallet = await getOrCreateWallet(input.userId);

  const result = await db.transaction(async (tx) => {
    // Cancel other active subscriptions for this user.
    await tx
      .update(subscriptions)
      .set({ status: "canceled", updatedAt: now })
      .where(and(eq(subscriptions.userId, input.userId), eq(subscriptions.status, "active")));

    const [sub] = await tx
      .insert(subscriptions)
      .values({
        userId: input.userId,
        planId: plan.id,
        status: "active",
        billingCycle: input.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        source: "manual",
        metadata: input.note ? { note: input.note } : undefined,
      })
      .returning();
    return sub;
  });

  // The free plan grants no subscription credits (its allowance is daily).
  let creditsGranted = 0;
  if (plan.monthlyCredits > 0) {
    await grantCredits(wallet.id, input.userId, {
      type: "subscription",
      amount: Number(plan.monthlyCredits),
      expiresAt: periodEnd,
      sourceRef: result.id,
      reference: `subscription:${result.id}`,
      metadata: { planId: plan.id, billingCycle: input.billingCycle, assignedBy: "admin" },
    });
    creditsGranted = Number(plan.monthlyCredits);
  }

  return { subscription: result, creditsGranted };
}

/** Ends a subscription at the end of the current period (no refunds in Phase 2). */
export async function cancelAtPeriodEnd(subscriptionId: string): Promise<Subscription> {
  const [updated] = await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.status, "active")))
    .returning();
  if (!updated) throw new Error("Active subscription not found");
  return updated;
}

/**
 * Lazy period-rollover: if the user's active subscription expired while
 * they were away, mark it expired. Safe to call per dashboard load.
 */
export async function reconcileSubscriptionStatus(userId: string): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        lt(subscriptions.currentPeriodEnd, new Date()),
      ),
    );
}
