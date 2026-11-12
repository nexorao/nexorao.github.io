import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providerCredentials, providers } from "@/db/schema";
import { decryptString, encryptString } from "@/lib/crypto/totp";
import { getProviderAdapter } from "@/lib/providers";
import type { ProviderConfig, ProviderProbeResult } from "@/lib/providers/types";

export interface AdminProviderRow {
  id: string;
  slug: string;
  name: string;
  adapter: string;
  baseUrl: string;
  notes: string | null;
  enabled: boolean;
  hasCredential: boolean;
  updatedAt: Date;
}

export async function listAdminProviders(): Promise<AdminProviderRow[]> {
  const rows = await db
    .select({
      id: providers.id,
      slug: providers.slug,
      name: providers.name,
      adapter: providers.adapter,
      baseUrl: providers.baseUrl,
      notes: providers.notes,
      enabled: providers.enabled,
      credentialId: providerCredentials.id,
      updatedAt: providers.updatedAt,
    })
    .from(providers)
    .leftJoin(providerCredentials, eq(providerCredentials.providerId, providers.id))
    .orderBy(providers.name);

  return rows.map(({ credentialId, baseUrl, ...row }) => ({
    ...row,
    baseUrl: baseUrl ?? "",
    hasCredential: credentialId !== null,
  }));
}

export async function saveProviderCredential(providerId: string, apiKey: string): Promise<void> {
  const envelope = encryptString(apiKey);
  await db
    .insert(providerCredentials)
    .values({ providerId, ...envelope })
    .onConflictDoUpdate({
      target: providerCredentials.providerId,
      set: { ...envelope, updatedAt: new Date() },
    });
}

export async function removeProviderCredential(providerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(providerCredentials).where(eq(providerCredentials.providerId, providerId));
    await tx
      .update(providers)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(providers.id, providerId));
  });
}

export async function probeProvider(providerId: string): Promise<ProviderProbeResult> {
  const [row] = await db
    .select({
      slug: providers.slug,
      name: providers.name,
      adapter: providers.adapter,
      baseUrl: providers.baseUrl,
      ciphertext: providerCredentials.ciphertext,
      iv: providerCredentials.iv,
      authTag: providerCredentials.authTag,
    })
    .from(providers)
    .leftJoin(providerCredentials, eq(providerCredentials.providerId, providers.id))
    .where(eq(providers.id, providerId))
    .limit(1);

  if (!row) throw new Error("Provider not found.");
  if (!row.ciphertext || !row.iv || !row.authTag) {
    throw new Error("Save an API key before testing this provider.");
  }

  const config: ProviderConfig = {
    slug: row.slug,
    name: row.name,
    adapter: row.adapter as ProviderConfig["adapter"],
    baseUrl: row.baseUrl ?? "",
    apiKey: decryptString({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
    }),
  };

  return getProviderAdapter(config.adapter).probe(config);
}

export async function enableProvider(providerId: string): Promise<void> {
  const [credential] = await db
    .select({ id: providerCredentials.id })
    .from(providerCredentials)
    .where(eq(providerCredentials.providerId, providerId))
    .limit(1);
  if (!credential) throw new Error("Save an API key before enabling this provider.");
  await db.update(providers).set({ enabled: true, updatedAt: new Date() }).where(eq(providers.id, providerId));
}

