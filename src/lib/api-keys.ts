import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, chatMessages } from "@/db/schema";
import { generateToken, hashToken } from "@/lib/crypto/password";

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  monthlyLimitCredits: number | null;
  requests: number;
  credits: number;
};

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  return Promise.all(rows.map(async (key) => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [usage] = await db.select({
      requests: sql<string>`count(*) filter (where ${chatMessages.status} in ('complete', 'failed'))`,
      credits: sql<string>`coalesce(sum(${chatMessages.creditsCharged}) filter (where ${chatMessages.status} = 'complete'), 0)`,
    }).from(chatMessages).where(and(eq(chatMessages.apiKeyId, key.id), gte(chatMessages.createdAt, monthStart)));
    return {
      id: key.id, name: key.name, prefix: key.prefix, createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt, expiresAt: key.expiresAt, revokedAt: key.revokedAt,
      monthlyLimitCredits: key.monthlyLimitCredits,
      requests: Number(usage.requests), credits: Number(usage.credits),
    };
  }));
}

export async function issueApiKey(userId: string, name: string, monthlyLimitCredits: number | null) {
  const token = `nx_live_${generateToken(32)}`;
  const prefix = token.slice(0, 16);
  const [created] = await db.insert(apiKeys).values({
    userId, name, keyHash: hashToken(token), prefix, monthlyLimitCredits,
  }).returning({ id: apiKeys.id });
  return { id: created.id, token, prefix };
}

export async function authenticateApiKey(token: string) {
  if (!token.startsWith("nx_live_") || token.length > 160) return null;
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashToken(token))).limit(1);
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) return null;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return { id: key.id, userId: key.userId, monthlyLimitCredits: key.monthlyLimitCredits };
}

export async function apiKeyMonthlyUsage(apiKeyId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db.select({
    credits: sql<string>`coalesce(sum(${chatMessages.creditsCharged}) filter (where ${chatMessages.status} = 'complete'), 0)`,
  }).from(chatMessages).where(and(eq(chatMessages.apiKeyId, apiKeyId), gte(chatMessages.createdAt, start)));
  return Number(row.credits);
}

export async function revokeApiKey(userId: string, id: string) {
  const [row] = await db.update(apiKeys).set({ revokedAt: new Date() }).where(
    and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)),
  ).returning({ id: apiKeys.id });
  return Boolean(row);
}
