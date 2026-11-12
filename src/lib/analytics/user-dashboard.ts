import "server-only";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chatConversations,
  chatMessages,
  models,
  providers,
} from "@/db/schema";
import { getActiveSubscription, getPlan } from "@/lib/subscriptions";
import { getOrCreateWallet, getHeldTotal, listActiveBuckets } from "@/lib/wallet";
import { getSettings } from "@/lib/settings";

export type DashboardRange = "24h" | "7d" | "30d";

export interface DashboardOverviewData {
  range: DashboardRange;
  planName: string;
  planId: string;
  allowance: number;
  allowanceLabel: string;
  cycleCreditsUsed: number;
  cycleTokensUsed: number;
  cycleStart: Date;
  cycleEnd: Date | null;
  balance: number;
  held: number;
  dailyLeft: number;
  periodRequests: number;
  periodTokens: number;
  periodSpendCredits: number;
  periodFailures: number;
  previousRequests: number;
  previousTokens: number;
  previousSpendCredits: number;
  previousFailures: number;
  series: { label: string; tokens: number; requests: number; credits: number }[];
  topModels: { name: string; tokens: number; credits: number }[];
  providerReady: boolean;
  creditValuePaise: number;
}

interface Metrics {
  requests: number;
  tokens: number;
  credits: number;
  failures: number;
}

function rangeMilliseconds(range: DashboardRange) {
  return range === "24h" ? 24 * 60 * 60_000 : range === "7d" ? 7 * 24 * 60 * 60_000 : 30 * 24 * 60 * 60_000;
}

export function getDashboardRangeStart(range: DashboardRange) {
  return new Date(Date.now() - rangeMilliseconds(range));
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function metricsFor(userId: string, since: Date): Promise<Metrics> {
  const [row] = await db
    .select({
      requests: sql<string>`count(*) filter (where ${chatMessages.status} in ('complete', 'failed'))`,
      failures: sql<string>`count(*) filter (where ${chatMessages.status} = 'failed')`,
      tokens: sql<string>`coalesce(sum(coalesce(${chatMessages.inputTokens}, 0) + coalesce(${chatMessages.outputTokens}, 0)) filter (where ${chatMessages.status} = 'complete'), 0)`,
      credits: sql<string>`coalesce(sum(${chatMessages.creditsCharged}) filter (where ${chatMessages.status} = 'complete'), 0)`,
    })
    .from(chatMessages)
    .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
    .where(
      and(
        eq(chatConversations.userId, userId),
        eq(chatMessages.role, "assistant"),
        gte(chatMessages.createdAt, since),
      ),
    );
  return {
    requests: Number(row.requests),
    failures: Number(row.failures),
    tokens: Number(row.tokens),
    credits: Number(row.credits),
  };
}

export async function getUserDashboardOverview(
  userId: string,
  range: DashboardRange,
): Promise<DashboardOverviewData> {
  const now = new Date();
  const rangeMs = rangeMilliseconds(range);
  const rangeStart = new Date(now.getTime() - rangeMs);
  const previousStart = new Date(rangeStart.getTime() - rangeMs);
  const cycleStartFallback = startOfUtcDay(now);
  const [sub, wallet, settings, [enabledProvider]] = await Promise.all([
    getActiveSubscription(userId),
    getOrCreateWallet(userId),
    getSettings(),
    db.select({ id: providers.id }).from(providers).where(eq(providers.enabled, true)).limit(1),
  ]);
  const planId = sub?.planId ?? "free";
  const plan = await getPlan(planId);
  const [buckets, held, currentCycleMetrics, currentMetrics, previousMetrics] = await Promise.all([
    listActiveBuckets(wallet.id),
    getHeldTotal(wallet.id),
    metricsFor(userId, sub?.currentPeriodStart ?? cycleStartFallback),
    metricsFor(userId, rangeStart),
    metricsFor(userId, previousStart),
  ]);
  // Use a SQL literal for the truncation unit so SELECT, GROUP BY and ORDER BY
  // share the same aggregate expression. Separate bound parameters are distinct
  // expressions to PostgreSQL and can make the grouped query invalid.
  const groupedAt = range === "24h"
    ? sql<Date>`date_trunc('hour', ${chatMessages.createdAt})`
    : sql<Date>`date_trunc('day', ${chatMessages.createdAt})`;
  const grouped = await db
    .select({
      bucket: groupedAt,
      requests: sql<string>`count(*) filter (where ${chatMessages.status} = 'complete')`,
      tokens: sql<string>`coalesce(sum(coalesce(${chatMessages.inputTokens}, 0) + coalesce(${chatMessages.outputTokens}, 0)), 0)`,
      credits: sql<string>`coalesce(sum(${chatMessages.creditsCharged}), 0)`,
    })
    .from(chatMessages)
    .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
    .where(
      and(
        eq(chatConversations.userId, userId),
        eq(chatMessages.role, "assistant"),
        eq(chatMessages.status, "complete"),
        gte(chatMessages.createdAt, rangeStart),
      ),
    )
    .groupBy(groupedAt)
    .orderBy(asc(groupedAt));
  const bucketMap = new Map(grouped.map((row) => [
    range === "24h" ? row.bucket.toISOString().slice(0, 13) : row.bucket.toISOString().slice(0, 10),
    { tokens: Number(row.tokens), requests: Number(row.requests), credits: Number(row.credits) },
  ]));
  const seriesCount = range === "24h" ? 24 : range === "7d" ? 7 : 30;
  const firstSeriesBucket = new Date(now);
  if (range === "24h") {
    firstSeriesBucket.setUTCHours(firstSeriesBucket.getUTCHours() - (seriesCount - 1), 0, 0, 0);
  } else {
    firstSeriesBucket.setUTCHours(0, 0, 0, 0);
    firstSeriesBucket.setUTCDate(firstSeriesBucket.getUTCDate() - (seriesCount - 1));
  }
  const series = Array.from({ length: seriesCount }, (_, index) => {
    const bucketDate = new Date(firstSeriesBucket);
    if (range === "24h") bucketDate.setUTCHours(bucketDate.getUTCHours() + index);
    else bucketDate.setUTCDate(bucketDate.getUTCDate() + index);
    const key = range === "24h" ? bucketDate.toISOString().slice(0, 13) : bucketDate.toISOString().slice(0, 10);
    const value = bucketMap.get(key) ?? { tokens: 0, requests: 0, credits: 0 };
    return {
      label: range === "24h"
        ? bucketDate.toLocaleTimeString("en-IN", { hour: "numeric", timeZone: "UTC" })
        : bucketDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
      ...value,
    };
  });
  const topModelsRows = await db
    .select({
      name: models.name,
      tokens: sql<string>`coalesce(sum(coalesce(${chatMessages.inputTokens}, 0) + coalesce(${chatMessages.outputTokens}, 0)), 0)`,
      credits: sql<string>`coalesce(sum(${chatMessages.creditsCharged}), 0)`,
    })
    .from(chatMessages)
    .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
    .leftJoin(models, eq(models.id, chatMessages.modelId))
    .where(
      and(
        eq(chatConversations.userId, userId),
        eq(chatMessages.role, "assistant"),
        eq(chatMessages.status, "complete"),
        gte(chatMessages.createdAt, rangeStart),
      ),
    )
    .groupBy(models.name)
    .orderBy(sql`sum(coalesce(${chatMessages.inputTokens}, 0) + coalesce(${chatMessages.outputTokens}, 0)) desc`)
    .limit(4);
  const dailyLeft = buckets.filter((bucket) => bucket.type === "daily_free")
    .reduce((sum, bucket) => sum + Number(bucket.credits), 0);
  const allowance = Number(plan?.monthlyCredits ?? 0) || Number(plan?.dailyFreeCredits ?? 0);
  const allowanceLabel = Number(plan?.monthlyCredits ?? 0) > 0 ? "This cycle" : "Today";

  return {
    range,
    planName: plan?.name ?? "Free",
    planId,
    allowance,
    allowanceLabel,
    cycleCreditsUsed: currentCycleMetrics.credits,
    cycleTokensUsed: currentCycleMetrics.tokens,
    cycleStart: sub?.currentPeriodStart ?? cycleStartFallback,
    cycleEnd: sub?.currentPeriodEnd ?? null,
    balance: buckets.reduce((sum, bucket) => sum + Number(bucket.credits), 0),
    held,
    dailyLeft,
    periodRequests: currentMetrics.requests,
    periodTokens: currentMetrics.tokens,
    periodSpendCredits: currentMetrics.credits,
    periodFailures: currentMetrics.failures,
    previousRequests: previousMetrics.requests,
    previousTokens: previousMetrics.tokens,
    previousSpendCredits: previousMetrics.credits,
    previousFailures: previousMetrics.failures,
    series,
    topModels: topModelsRows.map((row) => ({
      name: row.name ?? "Unavailable model",
      tokens: Number(row.tokens),
      credits: Number(row.credits),
    })),
    providerReady: Boolean(enabledProvider),
    creditValuePaise: settings.creditValuePaise,
  };
}
