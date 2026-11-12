import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OverviewConsole } from "@/components/dashboard/overview-console";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserDashboardOverview, type DashboardRange } from "@/lib/analytics/user-dashboard";
import { ensureDailyGrant } from "@/lib/wallet";
import { reconcileSubscriptionStatus } from "@/lib/subscriptions";
import { site } from "@/lib/site";
import type { DashboardOverviewData as ConsoleData } from "@/components/dashboard/overview-console";

export const metadata: Metadata = { title: "Overview" };

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await connection();
  const [{ range: rawRange }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const range: DashboardRange = rawRange === "24h" || rawRange === "30d" ? rawRange : "7d";
  await Promise.all([ensureDailyGrant(user.id), reconcileSubscriptionStatus(user.id)]);
  const data = await getUserDashboardOverview(user.id, range);
  return <OverviewConsole name={user.name} data={toConsoleData(data)} />;
}

function toConsoleData(data: Awaited<ReturnType<typeof getUserDashboardOverview>>): ConsoleData {
  const percentDelta = (current: number, previous: number) =>
    previous > 0 ? ((current - previous) / previous) * 100 : null;
  const daily = data.allowanceLabel === "Today";
  const resetDate = data.cycleEnd ?? new Date(Date.UTC(
    data.cycleStart.getUTCFullYear(),
    data.cycleStart.getUTCMonth(),
    data.cycleStart.getUTCDate() + 1,
  ));
  const resetsInDays = daily
    ? 1
    : Math.max(0, Math.ceil((resetDate.getTime() - Date.now()) / 86_400_000));
  const successRate = data.periodRequests > 0
    ? ((data.periodRequests - data.periodFailures) / data.periodRequests) * 100
    : 0;
  const previousSuccessRate = data.previousRequests > 0
    ? ((data.previousRequests - data.previousFailures) / data.previousRequests) * 100
    : null;
  const spend = data.periodSpendCredits * data.creditValuePaise / 100;
  const previousSpend = data.previousSpendCredits * data.creditValuePaise / 100;

  return {
    range: data.range,
    plan: { name: data.planName, isFree: data.planId === "free" },
    cycle: {
      used: data.cycleCreditsUsed,
      limit: data.allowance,
      resetLabel: daily ? "Tomorrow" : resetDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
      resetsInDays,
    },
    balanceInr: data.balance * data.creditValuePaise / 100,
    endpoint: {
      baseUrl: `${site.url.replace(/\/$/, "")}/api/chat`,
      keyMasked: null,
      online: data.providerReady,
    },
    stats: {
      requests: { value: data.periodRequests, delta: percentDelta(data.periodRequests, data.previousRequests), series: data.series.map((row) => row.requests) },
      billedTokens: { value: data.periodTokens, delta: percentDelta(data.periodTokens, data.previousTokens), series: data.series.map((row) => row.tokens) },
      spendInr: { value: spend, delta: percentDelta(spend, previousSpend), series: data.series.map((row) => row.credits * data.creditValuePaise / 100) },
      successRate: {
        value: successRate,
        delta: previousSuccessRate === null ? null : successRate - previousSuccessRate,
        series: [],
      },
    },
    usage: {
      labels: data.series.map((row) => row.label),
      tokens: data.series.map((row) => row.tokens),
      requests: data.series.map((row) => row.requests),
      spendInr: data.series.map((row) => row.credits * data.creditValuePaise / 100),
    },
    topModels: data.topModels.map((model) => ({ name: model.name, tokens: model.tokens })),
  };
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-3 xl:grid-cols-[1.55fr_.85fr]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div>
      <Skeleton className="h-80" />
    </div>
  );
}
