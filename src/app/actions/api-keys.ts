"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { issueApiKey, revokeApiKey } from "@/lib/api-keys";
import { rateLimitAsync } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

export type ApiKeyActionState = { error?: string; notice?: string; issuedKey?: string };

export async function createApiKeyAction(_state: ApiKeyActionState, formData: FormData): Promise<ApiKeyActionState> {
  try {
    const user = await requireUser();
    const parsed = z.object({
      name: z.string().trim().min(2).max(48),
      monthlyLimit: z.preprocess((value) => value === "" || value == null ? null : Number(value), z.number().int().min(1).max(1_000_000_000).nullable()),
    }).safeParse({ name: formData.get("name"), monthlyLimit: formData.get("monthlyLimit") });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the key details." };
    const limit = await rateLimitAsync(`api-key-create:${user.id}`, 5, 60_000);
    if (!limit.allowed) return { error: "Too many keys created. Wait a minute and retry." };
    const active = await db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)));
    const activeCount = active.length;
    if (activeCount >= 10) return { error: "You have reached the 10-key account limit. Revoke an old key first." };
    const created = await issueApiKey(user.id, parsed.data.name, parsed.data.monthlyLimit);
    await writeAudit({ actorUserId: user.id, action: "user.api_key_created", entityType: "api_key", entityId: created.id, metadata: { name: parsed.data.name, prefix: created.prefix } });
    revalidatePath("/dashboard/api-keys");
    return { notice: "API key created. Copy it now; it will not be shown again.", issuedKey: created.token };
  } catch (error) {
    console.error("[api keys] create failed", error);
    return { error: "Could not create this key. Please try again." };
  }
}

export async function revokeApiKeyAction(id: string, _state: ApiKeyActionState, _formData: FormData): Promise<ApiKeyActionState> {
  void _state;
  void _formData;
  try {
    const user = await requireUser();
    if (!z.uuid().safeParse(id).success) return { error: "This key could not be found." };
    const revoked = await revokeApiKey(user.id, id);
    if (!revoked) return { error: "This key is already revoked or does not belong to your account." };
    await writeAudit({ actorUserId: user.id, action: "user.api_key_revoked", entityType: "api_key", entityId: id });
    revalidatePath("/dashboard/api-keys");
    return { notice: "API key revoked." };
  } catch {
    return { error: "Could not revoke this key." };
  }
}
