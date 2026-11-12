"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Code2, Copy, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatLocalPrice, useCurrency } from "@/components/currency/currency-provider";

/* -------------------------------------------------------------------------- */
/*  Data contract — make getUserDashboardOverview() return this shape.        */
/*  Dates are ISO strings so the object can cross the server→client boundary. */
/* -------------------------------------------------------------------------- */
export type OverviewRange = "24h" | "7d" | "30d";

export interface StatSeries {
  value: number;
  /** % change vs previous period (success rate: percentage points). null = no previous data */
  delta: number | null;
  /** small trend line, any length >= 2 */
  series: number[];
}

export interface DashboardOverviewData {
  range: OverviewRange;
  plan: { name: string; isFree: boolean };
  cycle: {
    used: number; // credits used this cycle
    limit: number; // credits allowed this cycle
    resetLabel: string; // e.g. "Dec 6"
    resetsInDays: number | null;
  };
  balanceInr: number;
  endpoint: { baseUrl: string; keyMasked: string | null; online: boolean };
  stats: {
    requests: StatSeries;
    billedTokens: StatSeries;
    spendInr: StatSeries;
    successRate: StatSeries;
  };
  usage: {
    labels: string[];
    tokens: number[];
    requests: number[];
    spendInr: number[];
  };
  topModels: { name: string; tokens: number }[];
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const fmt = (n: number) => compact.format(n);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/* -------------------------------------------------------------------------- */

export function OverviewConsole({ name, data }: { name: string; data: DashboardOverviewData }) {
  const [hello] = useState(greeting);
  const currency = useCurrency();
  const firstName = name.split(" ")[0] || name;

  return (
    <div className="flex flex-col gap-8">
      {/* Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-text-0">
            {hello}, {firstName} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-1.5 text-sm text-text-1">Here&apos;s what&apos;s happening with your API today.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/chat"><Code2 className="size-4" /> Playground</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/api-keys"><Plus className="size-4" /> Create API key</Link>
          </Button>
        </div>
      </header>

      {/* Hero row */}
      <div className="grid gap-4 xl:grid-cols-[1.9fr_1fr]">
        <PlanCard data={data} />
        <EndpointCard endpoint={data.endpoint} />
      </div>

      {/* Activity */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-xl font-semibold text-text-0">
            Activity
            <span className="flex items-center gap-1.5 text-xs font-medium text-success">
              <span className="size-1.5 rounded-full bg-success" /> Live
            </span>
          </h2>
          <RangeToggle range={data.range} />
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile label="Requests" value={fmt(data.stats.requests.value)} stat={data.stats.requests} color="var(--violet, #7c5cff)" />
          <StatTile label="Billed tokens" value={fmt(data.stats.billedTokens.value)} stat={data.stats.billedTokens} color="#12b5e8" />
          <StatTile label="Spend" value={formatLocalPrice(data.stats.spendInr.value, currency)} stat={data.stats.spendInr} color="#19c37d" />
          <StatTile
            label="Success rate"
            value={`${data.stats.successRate.value.toFixed(1)}%`}
            stat={data.stats.successRate}
            unit="pts"
            color="#f59e0b"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.9fr_1fr]">
          <UsageChart usage={data.usage} range={data.range} />
          <TopModels models={data.topModels} />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ Plan / quota ------------------------------ */

function PlanCard({ data }: { data: DashboardOverviewData }) {
  const currency = useCurrency();
  const { cycle, plan } = data;
  const pct = cycle.limit > 0 ? Math.min(100, Math.round((cycle.used / cycle.limit) * 100)) : 0;
  const left = Math.max(0, cycle.limit - cycle.used);
  const ringColor = pct >= 100 ? "var(--danger, #ef4444)" : pct >= 80 ? "var(--warn, #f59e0b)" : "var(--violet, #7c5cff)";

  return (
    <section
      className="glass relative overflow-hidden rounded-2xl border border-line p-6"
      style={{ backgroundImage: "radial-gradient(120% 140% at 0% 100%, rgba(18,181,232,.14), transparent 55%)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip><Star className="size-3" /> {plan.name} plan</Chip>
          {plan.isFree ? <Chip dot>Free tier</Chip> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/dashboard/wallet/top-up" prefetch>Top up</Link></Button>
          <Button asChild size="sm"><Link href="/dashboard/subscription">Upgrade</Link></Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-6">
        <div className="relative size-[88px] shrink-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line, rgba(255,255,255,.1))" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42" fill="none" stroke={ringColor} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 263.9} 263.9`}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-lg font-semibold text-text-0">{pct}%</span>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-2">Used this cycle</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight text-text-0">{fmt(cycle.used)}</span>
            <span className="text-base text-text-1">/ {fmt(cycle.limit)} credits</span>
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Credits left" value={fmt(left)} />
        <MiniStat
          label="Free credits reset"
          value={cycle.resetLabel}
          hint={cycle.resetsInDays !== null ? `${cycle.resetsInDays}d` : undefined}
        />
        <MiniStat label="Balance" value={formatLocalPrice(data.balanceInr, currency)} />
      </div>
    </section>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-[var(--glass-bg)] px-4 py-3">
      <p className="text-[11px] text-text-2">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-text-0">
        {value} {hint ? <span className="font-normal text-text-2">· {hint}</span> : null}
      </p>
    </div>
  );
}

function Chip({ children, dot }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[var(--glass-bg)] px-3 py-1 text-xs font-medium text-text-0">
      {dot ? <span className="size-1.5 rounded-full bg-success" /> : null}
      {children}
    </span>
  );
}

/* -------------------------------- Endpoint -------------------------------- */

function EndpointCard({ endpoint }: { endpoint: DashboardOverviewData["endpoint"] }) {
  return (
    <section className="glass flex flex-col gap-4 rounded-2xl border border-line p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-0">Your endpoint</h2>
          <p className="mt-0.5 text-xs text-text-2">Drop-in for any OpenAI SDK</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            endpoint.online ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          <span className={`size-1.5 rounded-full ${endpoint.online ? "bg-success" : "bg-danger"}`} />
          {endpoint.online ? "Online" : "Degraded"}
        </span>
      </div>

      <CopyRow value={endpoint.baseUrl} />
      <div className="flex items-center rounded-xl border border-line bg-bg-1 px-4 py-3 font-mono text-[13px] text-text-0">
        {endpoint.keyMasked ?? "No API key yet"}
      </div>
      <Link href="/dashboard/api-keys" className="text-xs font-medium text-sky-400 hover:underline">
        {endpoint.keyMasked ? "Manage API keys →" : "Create your first key →"}
      </Link>
    </section>
  );
}

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg-1 px-4 py-3">
      <code className="min-w-0 truncate font-mono text-[13px] text-text-0">{value}</code>
      <button type="button" onClick={copy} aria-label="Copy endpoint" className="shrink-0 text-text-1 transition-colors hover:text-text-0">
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

/* --------------------------------- Activity -------------------------------- */

function RangeToggle({ range }: { range: OverviewRange }) {
  const items: { key: OverviewRange; label: string }[] = [
    { key: "24h", label: "24h" },
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
  ];
  return (
    <nav aria-label="Time range" className="flex rounded-xl border border-line bg-[var(--glass-bg)] p-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={`/dashboard?range=${item.key}`}
          scroll={false}
          aria-current={range === item.key ? "true" : undefined}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            range === item.key ? "bg-[var(--glass-bg-hover)] text-text-0" : "text-text-1 hover:text-text-0"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function StatTile({
  label, value, stat, color, unit,
}: { label: string; value: string; stat: StatSeries; color: string; unit?: string }) {
  const { delta } = stat;
  // for every metric here, up = good except nothing is inverted; success-rate drop is red
  const good = delta === null ? null : delta >= 0;
  return (
    <div className="glass relative overflow-hidden rounded-2xl border border-line p-5">
      <p className="text-xs text-text-1">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-text-0">{value}</p>
      <p className={`mt-2 text-xs font-medium ${good === null ? "text-text-2" : good ? "text-success" : "text-danger"}`}>
        {delta === null ? "No previous data" : `${good ? "▲" : "▼"} ${Math.abs(delta).toFixed(unit ? 1 : 0)}${unit ? ` ${unit}` : "%"} vs previous`}
      </p>
      <Sparkline series={stat.series} color={color} />
    </div>
  );
}

function Sparkline({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return null;
  const max = Math.max(...series, 1);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * 100, 36 - (v / max) * 32] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute bottom-3 right-3 h-10 w-28" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

type UsageTab = "tokens" | "requests" | "spend";

function UsageChart({ usage, range }: { usage: DashboardOverviewData["usage"]; range: OverviewRange }) {
  const [tab, setTab] = useState<UsageTab>("tokens");
  const currency = useCurrency();
  const values = tab === "tokens" ? usage.tokens : tab === "requests" ? usage.requests : usage.spendInr;
  const rawMax = Math.max(...values, 1);
  const step = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / step) * step;
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((t) => t * max);
  const tabs: { key: UsageTab; label: string }[] = [
    { key: "tokens", label: "Tokens" },
    { key: "requests", label: "Requests" },
    { key: "spend", label: "Spend" },
  ];
  const sub = range === "24h" ? "Last 24 hours, hourly" : range === "7d" ? "Last 7 days, daily" : "Last 30 days, daily";
  const tickLabel = (n: number) => (tab === "spend" ? formatLocalPrice(n, currency) : fmt(n));

  return (
    <section className="glass rounded-2xl border border-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-0">Usage over time</h3>
          <p className="mt-0.5 text-xs text-text-2">{sub}</p>
        </div>
        <div role="tablist" className="flex rounded-xl border border-line bg-[var(--glass-bg)] p-1">
          {tabs.map((t) => (
            <button
              key={t.key} role="tab" type="button" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key ? "bg-[var(--glass-bg-hover)] text-text-0" : "text-text-1 hover:text-text-0"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <div className="flex h-56 flex-col justify-between pb-6 text-right text-[10px] text-text-2">
          {ticks.map((t, i) => <span key={i}>{tickLabel(t)}</span>)}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-56 flex-col justify-between pb-6" aria-hidden>
            {ticks.map((_, i) => <div key={i} className="border-t border-dashed border-line/70" />)}
          </div>
          <div className="relative flex h-56 items-end gap-2 pb-6">
            {values.map((v, i) => (
              <div key={i} className="group relative flex h-full flex-1 items-end justify-center">
                <div
                  className="w-full max-w-10 rounded-t-md bg-violet"
                  style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 3 : 0 }}
                  title={`${usage.labels[i]}: ${tickLabel(v)}`}
                />
                <span className="absolute -bottom-6 text-[10px] text-text-2">{usage.labels[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- Top models ------------------------------- */

const MODEL_COLORS = ["#6d4aff", "#12b5e8", "#19c37d", "#f59e0b", "#ec4899"];

function TopModels({ models }: { models: DashboardOverviewData["topModels"] }) {
  const total = models.reduce((a, m) => a + m.tokens, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  const arcs = models.slice(0, 5).reduce<{ name: string; color: string; length: number; offset: number }[]>(
    (items, model, index) => {
      const length = (model.tokens / total) * C;
      const offset = items.length ? items[items.length - 1].offset + items[items.length - 1].length : 0;
      return [...items, { name: model.name, color: MODEL_COLORS[index % MODEL_COLORS.length], length, offset }];
    },
    [],
  );

  return (
    <section className="glass rounded-2xl border border-line p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-0">Top models</h3>
      <p className="mt-0.5 text-xs text-text-2">Share of billed tokens</p>
        </div>
        <Link href="/dashboard/usage" className="text-xs font-medium text-sky-400 hover:underline">Details</Link>
      </div>

      {total === 0 ? (
        <p className="mt-8 text-sm text-text-2">No requests in this period yet. Try the Playground to see models here.</p>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <div className="relative size-40 shrink-0">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line, rgba(255,255,255,.08))" strokeWidth="9" />
              {arcs.map((arc) => (
                  <circle
                    key={arc.name} cx="50" cy="50" r={R} fill="none" strokeWidth="9"
                    stroke={arc.color}
                    strokeDasharray={`${arc.length} ${C - arc.length}`} strokeDashoffset={-arc.offset}
                  />
              ))}
            </svg>
            <div className="absolute inset-0 grid place-content-center text-center">
              <span className="text-xl font-semibold text-text-0">{fmt(total)}</span>
              <span className="text-[10px] text-text-2">credits</span>
            </div>
          </div>

          <ul className="flex min-w-0 flex-1 flex-col gap-4">
            {models.slice(0, 5).map((m, i) => (
              <li key={m.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-text-0">{m.name}</span>
                <span className="text-text-1">{fmt(m.tokens)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(m.tokens / total) * 100}%`, background: MODEL_COLORS[i % MODEL_COLORS.length] }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
