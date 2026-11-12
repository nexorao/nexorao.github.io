"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { providers } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { removeProviderCredential, saveProviderCredential, probeProvider, enableProvider } from "@/lib/providers/registry";
import { eq } from "drizzle-orm";

export interface ProviderActionState {
  error?: string;
  notice?: string;
  models?: { id: string; name: string }[];
}

const providerIdSchema = z.uuid("Invalid provider.");

export async function saveProviderCredentialAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  try {
    const admin = await requireAdmin();
    if (!process.env.APP_ENCRYPTION_KEY) {
      return { error: "Add APP_ENCRYPTION_KEY to the server environment before storing provider keys." };
    }
    const parsed = z.object({
      providerId: providerIdSchema,
      apiKey: z.string().trim().min(8, "Enter a valid provider API key.").max(500),
    }).safeParse({
      providerId: formData.get("providerId"),
      apiKey: formData.get("apiKey"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the provider key." };

    const [provider] = await db.select({ id: providers.id, slug: providers.slug }).from(providers)
      .where(eq(providers.id, parsed.data.providerId)).limit(1);
    if (!provider) return { error: "Provider not found." };

    await saveProviderCredential(provider.id, parsed.data.apiKey);
    await writeAudit({
      actorUserId: admin.id,
      action: "admin.provider_credential_saved",
      entityType: "provider",
      entityId: provider.id,
      metadata: { provider: provider.slug, credentialValue: "redacted" },
    });
    revalidatePath("/dashboard/admin/providers");
    return { notice: "API key encrypted and saved. Test the connection to enable this provider." };
  } catch (error) {
    console.error("[provider action] credential save failed", error);
    return { error: "Could not save the provider key. Check the server encryption settings." };
  }
}

export async function testProviderConnectionAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  try {
    const admin = await requireAdmin();
    const parsed = providerIdSchema.safeParse(formData.get("providerId"));
    if (!parsed.success) return { error: "Invalid provider." };
    const result = await probeProvider(parsed.data);
    await enableProvider(parsed.data);
    const [provider] = await db.select({ slug: providers.slug }).from(providers)
      .where(eq(providers.id, parsed.data)).limit(1);
    await writeAudit({
      actorUserId: admin.id,
      action: "admin.provider_connection_verified",
      entityType: "provider",
      entityId: parsed.data,
      metadata: { provider: provider?.slug, discoveredModels: result.models.length },
    });
    revalidatePath("/dashboard/admin/providers");
    revalidatePath("/models");
    return { notice: `Connection verified. ${result.models.length} model IDs found.`, models: result.models };
  } catch (error) {
    console.error("[provider action] connection test failed", error);
    const message = error instanceof Error ? error.message : "Connection test failed.";
    return { error: message.slice(0, 320) };
  }
}

export async function removeProviderCredentialAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  try {
    const admin = await requireAdmin();
    const parsed = providerIdSchema.safeParse(formData.get("providerId"));
    if (!parsed.success) return { error: "Invalid provider." };
    const [provider] = await db.select({ slug: providers.slug }).from(providers)
      .where(eq(providers.id, parsed.data)).limit(1);
    if (!provider) return { error: "Provider not found." };

    await removeProviderCredential(parsed.data);
    await writeAudit({
      actorUserId: admin.id,
      action: "admin.provider_credential_removed",
      entityType: "provider",
      entityId: parsed.data,
      metadata: { provider: provider.slug },
    });
    revalidatePath("/dashboard/admin/providers");
    revalidatePath("/models");
    return { notice: "Key removed and provider disabled." };
  } catch (error) {
    console.error("[provider action] credential removal failed", error);
    return { error: "Could not remove this provider key." };
  }
}
