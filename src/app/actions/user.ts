"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userPreferences, users } from "@/db/schema";
import { requireUser, destroyAllSessions, destroyOtherSessions, destroySession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/crypto/password";
import {
  changePassword,
  confirmTotpSetup,
  disableTotp,
  initiateTotpSetup,
} from "@/lib/auth/users";
import { cancelAtPeriodEnd, getActiveSubscription } from "@/lib/subscriptions";
import { writeAudit } from "@/lib/audit";

/**
 * User self-service actions (profile, password, 2FA, subscription cancel).
 * Every action authenticates server-side via requireUser() and writes an
 * audit entry for sensitive changes (spec §15).
 */

export interface UserActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string[]>;
  /** Returned by the 2FA setup action for QR rendering. */
  secretBase32?: string;
  uri?: string;
}

const nameSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80, "Name is too long"),
  phone: z.string().trim().max(35, "Phone number is too long"),
});

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .regex(/[a-zA-Z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

function flattenIssues(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

export async function updateProfileAction(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    const user = await requireUser();
    const parsed = nameSchema.safeParse({ name: formData.get("name"), phone: formData.get("phone") ?? "" });
    if (!parsed.success) {
      return { error: "Check the highlighted fields.", fieldErrors: flattenIssues(parsed.error) };
    }
    await db
      .update(users)
      .set({ name: parsed.data.name, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await db.insert(userPreferences).values({ userId: user.id, phone: parsed.data.phone || null })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { phone: parsed.data.phone || null, updatedAt: new Date() } });
    await writeAudit({
      actorUserId: user.id,
      action: "user.profile_updated",
      entityType: "user",
      entityId: user.id,
    });
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { notice: "Profile updated." };
  } catch {
    return { error: "Session expired — sign in again." };
  }
}

export async function signOutOtherSessionsAction() {
  const user = await requireUser();
  await destroyOtherSessions(user.id);
  revalidatePath("/dashboard/settings");
}

export async function deleteAccountAction(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  try {
    const user = await requireUser();
    const parsed = z.object({ password: z.string().min(1), confirmation: z.literal("DELETE") }).safeParse({
      password: formData.get("password"), confirmation: formData.get("confirmation"),
    });
    if (!parsed.success) return { error: "Enter your password and type DELETE to confirm." };
    const [account] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!account || !verifyPassword(parsed.data.password, account.passwordHash)) return { error: "Your password is incorrect." };
    await db.update(users).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await destroyAllSessions(user.id);
    await destroySession();
    redirect("/?account=deleted");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: "Could not close your account. Try again." };
  }
}

export async function changePasswordAction(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    const user = await requireUser();
    const schema = z.object({
      current: z.string().min(1, "Enter your current password"),
      password: passwordSchema,
      confirm: z.string(),
    });
    const parsed = schema.safeParse({
      current: formData.get("current"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.success) {
      return { error: "Check the highlighted fields.", fieldErrors: flattenIssues(parsed.error) };
    }
    if (parsed.data.password !== parsed.data.confirm) {
      return { error: "Passwords do not match.", fieldErrors: { confirm: ["Passwords do not match"] } };
    }

    const result = await changePassword(user.id, parsed.data.current, parsed.data.password);
    if (result === "wrong_password") {
      return { error: "Your current password is incorrect.", fieldErrors: { current: ["Incorrect password"] } };
    }

    // Password changed: every OTHER session dies; this one stays signed in.
    await destroyOtherSessions(user.id);
    revalidatePath("/dashboard/settings");
    return { notice: "Password changed. Other sessions have been signed out." };
  } catch {
    return { error: "Session expired — sign in again." };
  }
}

export async function initiateTotpAction(): Promise<UserActionState> {
  try {
    const user = await requireUser();
    if (user.totpEnabled) {
      return { error: "2FA is already enabled on this account." };
    }
    const setup = await initiateTotpSetup(user.id, user.email);
    revalidatePath("/dashboard/settings");
    return { secretBase32: setup.secretBase32, uri: setup.uri };
  } catch {
    return { error: "Session expired — sign in again." };
  }
}

export async function confirmTotpAction(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    const user = await requireUser();
    const code = String(formData.get("code") ?? "").replace(/\D/g, "");
    if (code.length !== 6) {
      return { error: "Enter the 6-digit code from your authenticator app." };
    }
    const result = await confirmTotpSetup(user.id, code);
    if (result === "invalid_code") {
      return { error: "That code is not valid. Codes rotate every 30 seconds — try the current one." };
    }
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { notice: "Two-factor authentication is now active on your account." };
  } catch {
    return { error: "Session expired — sign in again." };
  }
}

export async function disableTotpAction(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    const user = await requireUser();
    const schema = z.object({
      password: z.string().min(1, "Enter your password"),
      code: z.string().trim(),
    });
    const parsed = schema.safeParse({
      password: formData.get("password"),
      code: formData.get("code") ?? "",
    });
    if (!parsed.success) {
      return { error: "Check the highlighted fields.", fieldErrors: flattenIssues(parsed.error) };
    }
    const result = await disableTotp(user.id, parsed.data.password, parsed.data.code.replace(/\D/g, ""));
    if (result === "wrong_password") {
      return { error: "Your password is incorrect.", fieldErrors: { password: ["Incorrect password"] } };
    }
    if (result === "invalid_code") {
      return { error: "That authenticator code is not valid — try again." };
    }
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { notice: "Two-factor authentication disabled." };
  } catch {
    return { error: "Session expired — sign in again." };
  }
}

export async function cancelSubscriptionAction(
  /* eslint-disable @typescript-eslint/no-unused-vars -- required by useActionState's (state, formData) signature */
  _state: UserActionState,
  _formData: FormData,
  /* eslint-enable @typescript-eslint/no-unused-vars */
): Promise<UserActionState> {
  try {
    const user = await requireUser();
    const sub = await getActiveSubscription(user.id);
    if (!sub) return { error: "You do not have an active subscription." };
    if (sub.cancelAtPeriodEnd) return { notice: "Already scheduled to end at the period close." };

    await cancelAtPeriodEnd(sub.id);
    await writeAudit({
      actorUserId: user.id,
      action: "subscription.cancel_scheduled",
      entityType: "subscription",
      entityId: sub.id,
      metadata: { planId: sub.planId },
    });
    revalidatePath("/dashboard/subscription");
    return { notice: `Your plan stays active until ${sub.currentPeriodEnd.toLocaleDateString("en-GB")}, then ends.` };
  } catch {
    return { error: "Session expired — sign in again." };
  }
}
