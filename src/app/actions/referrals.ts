"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { claimReferralCode } from "@/lib/referrals";
import { rateLimitAsync } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

export type ReferralActionState = { error?: string; notice?: string };

export async function applyReferralCodeAction(_state: ReferralActionState, formData: FormData): Promise<ReferralActionState> {
  try {
    const user = await requireUser();
    const parsed = z.string().trim().min(1).max(32).safeParse(formData.get("code"));
    if (!parsed.success) return { error: "Enter your friend's NEXORA invite code." };
    const limit = await rateLimitAsync(`referral-claim:${user.id}`, 3, 60 * 60_000);
    if (!limit.allowed) return { error: "Wait a while before trying another invite code." };
    const result = await claimReferralCode(user.id, parsed.data);
    if (!result.ok) return { error: result.error };
    await writeAudit({ actorUserId: user.id, action: "user.referral_applied", entityType: "referral", entityId: result.referralId });
    revalidatePath("/dashboard/referrals");
    return { notice: result.credits > 0 ? `Invite applied. You and your friend each received ${result.credits.toLocaleString("en-IN")} credits.` : "Invite recorded. Referral rewards are currently paused." };
  } catch {
    return { error: "Could not apply this code. Please try again." };
  }
}
