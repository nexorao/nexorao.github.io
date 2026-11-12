"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plans, topupPacks, users } from "@/db/schema";
import { requireAdmin, destroyAllSessions, AuthError } from "@/lib/auth/session";
import { assignPlan } from "@/lib/subscriptions";
import { deductCredits, expireBuckets, expireStaleReservations, grantCredits, getOrCreateWallet } from "@/lib/wallet";
import { getSetting, setSetting, isEditableSetting } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";

/**
 * Admin actions (spec §15): RBAC-gated (requireAdmin), Zod-validated, every
 * sensitive operation audited with the acting admin as the actor.
 */

export interface AdminActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string[]>;
}

function friendlyAuthError(err: unknown): string {
  if (err instanceof AuthError) {
    switch (err.code) {
      case "unauthenticated":
        return "Session expired — sign in again.";
      case "suspended":
        return "Your account is suspended.";
      case "forbidden":
        return "You do not have admin access.";
    }
  }
  console.error("[admin action]", err);
  return "Something went wrong — try again.";
}

async function admin(
  fn: (ctx: { adminId: string; ip: string | null }) => Promise<AdminActionState>,
): Promise<AdminActionState> {
  try {
    const user = await requireAdmin();
    return await fn({ adminId: user.id, ip: null });
  } catch (err) {
    return { error: friendlyAuthError(err) };
  }
}

// ---------------------------------------------------------------------------
// Users: suspend / restore / plan / credits
// ---------------------------------------------------------------------------

export async function suspendUserAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return admin(async ({ adminId }) => {
    const userId = z.uuid("Invalid user").parse(String(formData.get("userId") ?? ""));
    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { error: "User not found." };
    if (target.status === "suspended") return { notice: "User is already suspended." };

    await db.update(users).set({ status: "suspended", updatedAt: new Date() }).where(eq(users.id, userId));
    await destroyAllSessions(userId);
    await writeAudit({
      actorUserId: adminId,
      action: "admin.user_suspended",
      entityType: "user",
      entityId: userId,
      metadata: { email: target.email },
    });
    revalidatePath("/dashboard/admin/users");
    return { notice: `${target.email} suspended and signed out everywhere.` };
  });
}

export async function restoreUserAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return admin(async ({ adminId }) => {
    const userId = z.uuid("Invalid user").parse(String(formData.get("userId") ?? ""));
    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { error: "User not found." };

    await db.update(users).set({ status: "active", updatedAt: new Date() }).where(eq(users.id, userId));
    await writeAudit({
      actorUserId: adminId,
      action: "admin.user_restored",
      entityType: "user",
      entityId: userId,
      metadata: { email: target.email },
    });
    revalidatePath("/dashboard/admin/users");
    return { notice: `${target.email} restored.` };
  });
}

const changePlanSchema = z.object({
  userId: z.uuid("Invalid user"),
  planId: z.string().min(1, "Choose a plan"),
  billingCycle: z.enum(["monthly", "annual"]),
});

export async function changeUserPlanAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return admin(async ({ adminId }) => {
    const parsed = changePlanSchema.parse({
      userId: formData.get("userId"),
      planId: formData.get("planId"),
      billingCycle: formData.get("billingCycle") ?? "monthly",
    });

    const result = await assignPlan({
      userId: parsed.userId,
      planId: parsed.planId,
      billingCycle: parsed.billingCycle,
      note: `assigned by admin ${adminId}`,
    });
    await writeAudit({
      actorUserId: adminId,
      action: "admin.plan_assigned",
      entityType: "user",
      entityId: parsed.userId,
      metadata: {
        planId: parsed.planId,
        billingCycle: parsed.billingCycle,
        subscriptionId: result.subscription.id,
        creditsGranted: result.creditsGranted,
      },
    });
    revalidatePath("/dashboard/admin/users");
    revalidatePath("/dashboard/subscription");
    return { notice: `Plan ${parsed.planId} assigned (${result.creditsGranted.toLocaleString("en-IN")} credits granted).` };
  });
}

const grantSchema = z.object({
  userId: z.uuid("Invalid user"),
  kind: z.enum(["purchased", "promotional"]),
  amount: z.coerce.number().int("Whole credits only").positive("Amount must be positive").max(10_000_000),
  note: z.string().trim().max(280).optional(),
});

export async function grantCreditsAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return admin(async ({ adminId }) => {
    const parsed = grantSchema.parse({
      userId: formData.get("userId"),
      kind: formData.get("kind"),
      amount: formData.get("amount"),
      note: formData.get("note") || undefined,
    });
    const wallet = await getOrCreateWallet(parsed.userId);
    const result = await grantCredits(wallet.id, parsed.userId, {
      type: parsed.kind,
      amount: parsed.amount,
      expiresAt: null,
      reference: `admin:${adminId}`,
      metadata: { adminId, note: parsed.note ?? null },
    });
    await writeAudit({
      actorUserId: adminId,
      action: "admin.credits_granted",
      entityType: "user",
      entityId: parsed.userId,
      metadata: { kind: parsed.kind, amount: parsed.amount, note: parsed.note ?? null },
    });
    revalidatePath("/dashboard/admin/users");
    revalidatePath("/dashboard/wallet");
    return { notice: `${parsed.amount.toLocaleString("en-IN")} credits granted (balance ${result.balanceAfter.toLocaleString("en-IN")}).` };
  });
}

const deductSchema = z.object({
  userId: z.uuid("Invalid user"),
  amount: z.coerce.number().int("Whole credits only").positive("Amount must be positive").max(10_000_000),
  reason: z.string().trim().min(3, "Give a short reason").max(280),
});

export async function deductCreditsAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return admin(async ({ adminId }) => {
    const parsed = deductSchema.parse({
      userId: formData.get("userId"),
      amount: formData.get("amount"),
      reason: formData.get("reason"),
    });
    const result = await deductCredits(parsed.userId, parsed.amount, `admin:${adminId}`, {
      adminId,
      reason: parsed.reason,
    });
    await writeAudit({
      actorUserId: adminId,
      action: "admin.credits_deducted",
      entityType: "user",
      entityId: parsed.userId,
      metadata: { amount: parsed.amount, reason: parsed.reason },
    });
    revalidatePath("/dashboard/admin/users");
    revalidatePath("/dashboard/wallet");
    return { notice: `${parsed.amount.toLocaleString("en-IN")} credits deducted (balance ${result.balanceAfter.toLocaleString("en-IN")}).` };
  });
}

// ---------------------------------------------------------------------------
// Plans & top-up packs editing
// ---------------------------------------------------------------------------

const updatePlanSchema = z.object({
  planId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160).optional(),
  priceRupees: z.coerce.number().int("Whole rupees only").min(0).max(10_000_000),
  monthlyCredits: z.coerce.number().int().min(0).max(1_000_000_000),
  dailyFreeCredits: z.coerce.number().int().min(0).max(1_000_000),
  sortOrder: z.coerce.number().int().min(0).max(999),
  active: z.coerce.boolean(),
});

export async function updatePlanAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return admin(async ({ adminId }) => {
    const parsed = updatePlanSchema.parse({
      planId: formData.get("planId"),
      name: formData.get("name"),
      tagline: formData.get("tagline") || undefined,
      priceRupees: formData.get("priceRupees"),
      monthlyCredits: formData.get("monthlyCredits"),
      dailyFreeCredits: formData.get("dailyFreeCredits"),
      sortOrder: formData.get("sortOrder"),
      active: formData.get("active") === "on" || formData.get("active") === "true",
    });

    await db
      .update(plans)
      .set({
        name: parsed.name,
        tagline: parsed.tagline ?? null,
        pricePaiseMonthly: parsed.priceRupees * 100,
        monthlyCredits: parsed.monthlyCredits,
        dailyFreeCredits: parsed.dailyFreeCredits,
        sortOrder: parsed.sortOrder,
        active: parsed.active,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, parsed.planId));

    await writeAudit({
      actorUserId: adminId,
      action: "admin.plan_updated",
      entityType: "plan",
      entityId: parsed.planId,
      metadata: {
        priceRupees: parsed.priceRupees,
        monthlyCredits: parsed.monthlyCredits,
        dailyFreeCredits: parsed.dailyFreeCredits,
        active: parsed.active,
      },
    });
    revalidatePath("/dashboard/admin/plans");
    revalidatePath("/pricing");
    revalidatePath("/dashboard/subscription");
    return { notice: `Plan ${parsed.planId} saved.` };
  });
}

const updatePackSchema = z.object({
  packId: z.string().min(1),
  priceRupees: z.coerce.number().int("Whole rupees only").min(0).max(10_000_000),
  credits: z.coerce.number().int().min(0).max(1_000_000_000),
  bonusCredits: z.coerce.number().int().min(0).max(1_000_000_000),
  active: z.coerce.boolean(),
});

export async function updateTopupPackAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return admin(async ({ adminId }) => {
    const parsed = updatePackSchema.parse({
      packId: formData.get("packId"),
      priceRupees: formData.get("priceRupees"),
      credits: formData.get("credits"),
      bonusCredits: formData.get("bonusCredits"),
      active: formData.get("active") === "on" || formData.get("active") === "true",
    });

    await db
      .update(topupPacks)
      .set({
        pricePaise: parsed.priceRupees * 100,
        credits: parsed.credits,
        bonusCredits: parsed.bonusCredits,
        active: parsed.active,
      })
      .where(eq(topupPacks.id, parsed.packId));

    await writeAudit({
      actorUserId: adminId,
      action: "admin.topup_pack_updated",
      entityType: "topup_pack",
      entityId: parsed.packId,
      metadata: {
        priceRupees: parsed.priceRupees,
        credits: parsed.credits,
        bonusCredits: parsed.bonusCredits,
        active: parsed.active,
      },
    });
    revalidatePath("/dashboard/admin/plans");
    revalidatePath("/pricing");
    return { notice: `Pack ${parsed.packId} saved.` };
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.coerce.number(),
});

export async function updateSettingAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return admin(async ({ adminId }) => {
    const parsed = updateSettingSchema.parse({
      key: formData.get("key"),
      value: formData.get("value"),
    });
    if (!isEditableSetting(parsed.key)) {
      return { error: `Setting "${parsed.key}" is not editable.` };
    }

    const before = await getSetting(parsed.key);
    await setSetting(parsed.key, parsed.value);
    await writeAudit({
      actorUserId: adminId,
      action: "admin.setting_updated",
      entityType: "setting",
      entityId: parsed.key,
      metadata: { from: before, to: parsed.value },
    });
    revalidatePath("/dashboard/admin/plans");
    return { notice: `${parsed.key} saved.` };
  });
}

// ---------------------------------------------------------------------------
// Maintenance trigger (reconciler)
// ---------------------------------------------------------------------------

export async function runMaintenanceAction(
  /* eslint-disable @typescript-eslint/no-unused-vars -- required by useActionState's (state, formData) signature */
  _state: AdminActionState,
  _formData: FormData,
  /* eslint-enable @typescript-eslint/no-unused-vars */
): Promise<AdminActionState> {
  return admin(async ({ adminId }) => {
    const expiredReservations = await expireStaleReservations();
    const expiredBucketCredits = await expireBuckets();
    await writeAudit({
      actorUserId: adminId,
      action: "admin.maintenance_run",
      entityType: "system",
      metadata: { expiredReservations, expiredBucketCredits },
    });
    revalidatePath("/dashboard/admin");
    return {
      notice: `Maintenance done — ${expiredReservations} stale reservation(s) released, ${expiredBucketCredits} expired credit(s) cleared.`,
    };
  });
}
