import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { and, desc, eq, gte } from "drizzle-orm";
import { Activity, CircleAlert, Clock3, Coins } from "lucide-react";
import { db } from "@/db";
import { chatConversations, chatMessages, models } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardRangeStart, getUserDashboardOverview, type DashboardRange } from "@/lib/analytics/user-dashboard";
import { formatCredits } from "@/lib/format";
import { UsageChart } from "./usage-chart";
import { UsageExportButton } from "./usage-export-button";
import { Skeleton } from "@/components/ui/skeleton";
import { LocalizedPrice } from "@/components/currency/localized-price";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Usage & logs" };

export default function UsagePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  return <Suspense fallback={<UsageSkeleton />}><UsageContent searchParams={searchParams} /></Suspense>;
}

async function UsageContent({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await connection();
  const [{ range: rawRange }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const range: DashboardRange = rawRange === "24h" || rawRange === "30d" ? rawRange : "7d";
  const data = await getUserDashboardOverview(user.id, range);
  const since = getDashboardRangeStart(range);
  const logs = await db
    .select({
      id: chatMessages.id,
      createdAt: chatMessages.createdAt,
      status: chatMessages.status,
      model: models.name,
      inputTokens: chatMessages.inputTokens,
      outputTokens: chatMessages.outputTokens,
      credits: chatMessages.creditsCharged,
      latencyMs: chatMessages.latencyMs,
    })
    .from(chatMessages)
    .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
    .leftJoin(models, eq(models.id, chatMessages.modelId))
    .where(and(eq(chatConversations.userId, user.id), eq(chatMessages.role, "assistant"), gte(chatMessages.createdAt, since)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(50);
  const spend = data.periodSpendCredits * data.creditValuePaise / 100;
  const successRate = data.periodRequests ? ((data.periodRequests - data.periodFailures) / data.periodRequests) * 100 : 0;
  const exportRows = logs.map((row) => ({
    date: row.createdAt.toISOString(),
    model: row.model ?? "Unavailable model",
    status: row.status,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    credits: row.credits,
    latencyMs: row.latencyMs ?? ("" as const),
  }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight text-text-0">Usage &amp; logs</h1><p className="mt-1.5 text-sm text-text-1">Review requests, token counts and credits charged to your wallet.</p></div>
        <div className="flex gap-2"><UsageExportButton rows={exportRows} /><Button asChild variant="outline"><Link href="/dashboard/chat"><Activity className="size-4" /> Go to Playground</Link></Button></div>
      </header>

      <nav aria-label="Usage period" className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line bg-bg-1 p-1">{(["24h", "7d", "30d"] as const).map((item) => <a key={item} href={`/dashboard/usage?range=${item}`} aria-current={range === item ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${range === item ? "bg-bg-3 text-text-0" : "text-text-2 hover:text-text-0"}`}>{item === "7d" ? "7d" : item}</a>)}</div>
        <span className="ml-auto text-xs text-text-2">Showing the last {range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days"}</span>
      </nav>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={Activity} label="Requests" value={data.periodRequests.toLocaleString("en-IN")} note={`${data.periodFailures} failed`} />
        <Metric icon={Coins} label="Billed tokens" value={compact(data.periodTokens)} note={`${formatCredits(data.periodSpendCredits)} credits`} />
        <Metric icon={Coins} label="Wallet spend" value={<LocalizedPrice inrAmount={spend} />} note="Based on your current credit value" />
        <Metric icon={Clock3} label="Success rate" value={`${successRate.toFixed(1)}%`} note="Completed requests" />
      </div>

      <UsageChart range={range} series={data.series} />

      <section className="glass overflow-hidden rounded-2xl border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-semibold text-text-0">Request logs</h2><p className="mt-0.5 text-xs text-text-2">Latest 50 requests in this period</p></div><span className="rounded-full border border-line px-2.5 py-1 text-xs text-text-2">{logs.length} records</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b border-line bg-bg-1/60 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-2"><th className="px-5 py-3">Date</th><th className="px-5 py-3">Model</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Tokens</th><th className="px-5 py-3 text-right">Credits</th><th className="px-5 py-3 text-right">Latency</th></tr></thead>
            <tbody>{logs.length ? logs.map((row) => <tr key={row.id} className="border-b border-line/60 last:border-0"><td className="whitespace-nowrap px-5 py-3 text-xs text-text-2">{row.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td><td className="px-5 py-3 font-medium text-text-0">{row.model ?? "Unavailable model"}</td><td className="px-5 py-3"><Status status={row.status} /></td><td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-text-1">{formatCredits((row.inputTokens ?? 0) + (row.outputTokens ?? 0))}</td><td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-text-1">{formatCredits(row.credits)}</td><td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-text-1">{row.latencyMs === null ? "—" : `${row.latencyMs} ms`}</td></tr>) : <tr><td colSpan={6} className="px-5 py-14 text-center"><CircleAlert className="mx-auto size-5 text-text-2" /><p className="mt-3 font-medium text-text-0">No requests in this period</p><p className="mt-1 text-sm text-text-2">Your completed and failed chat requests will show up here.</p><Button asChild variant="outline" size="sm" className="mt-4"><Link href="/dashboard/chat">Open Playground</Link></Button></td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UsageSkeleton() {
  return <div className="flex flex-col gap-4"><Skeleton className="h-20" /><Skeleton className="h-10" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-80" /><Skeleton className="h-72" /></div>;
}

function compact(value: number) { return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function Metric({ icon: Icon, label, value, note }: { icon: typeof Activity; label: string; value: ReactNode; note: string }) { return <section className="glass rounded-2xl border border-line p-5"><div className="flex items-center justify-between"><p className="text-xs text-text-2">{label}</p><Icon className="size-4 text-text-2" /></div><p className="mt-2 text-3xl font-semibold tracking-tight text-text-0">{value}</p><p className="mt-1.5 text-xs text-text-2">{note}</p></section>; }
function Status({ status }: { status: string }) { const failed = status === "failed"; const running = status === "streaming"; return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${failed ? "bg-danger/10 text-danger" : running ? "bg-warn/10 text-warn" : "bg-success/10 text-success"}`}><span className="size-1.5 rounded-full bg-current" />{failed ? "Failed" : running ? "Running" : "Complete"}</span>; }
