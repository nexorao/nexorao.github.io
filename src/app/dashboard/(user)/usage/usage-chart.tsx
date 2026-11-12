"use client";

import { useState } from "react";
import type { DashboardRange } from "@/lib/analytics/user-dashboard";

type Point = { label: string; tokens: number; requests: number; credits: number };
type ChartMetric = "tokens" | "requests" | "credits";

export function UsageChart({ range, series }: { range: DashboardRange; series: Point[] }) {
  const [metric, setMetric] = useState<ChartMetric>("tokens");
  const values = series.map((point) => point[metric]);
  const max = Math.max(...values, 1);
  const heading = metric === "tokens" ? "Token usage trend" : metric === "requests" ? "Requests over time" : "Credits used";

  return (
    <section className="glass rounded-2xl border border-line">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div><h2 className="font-semibold text-text-0">{heading}</h2><p className="mt-0.5 text-xs text-text-2">{range === "24h" ? "Input, output and credits by hour" : `Daily activity over the last ${range === "7d" ? "7" : "30"} days`}</p></div>
        <div role="tablist" aria-label="Usage chart metric" className="flex rounded-xl border border-line bg-bg-1 p-1">{(["tokens", "requests", "credits"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={metric === item} onClick={() => setMetric(item)} className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${metric === item ? "bg-bg-3 text-text-0" : "text-text-2 hover:text-text-0"}`}>{item}</button>)}</div>
      </div>
      <div className="px-5 pb-5 pt-6">
        <div className="flex h-56 items-end gap-1 border-b border-line bg-[linear-gradient(to_bottom,transparent_24.5%,var(--line)_25%,transparent_25.5%,transparent_49.5%,var(--line)_50%,transparent_50.5%,transparent_74.5%,var(--line)_75%,transparent_75.5%)] sm:gap-2">
          {series.map((point, index) => { const value = values[index]; return <div key={`${point.label}-${index}`} className="group relative flex h-full min-w-0 flex-1 items-end justify-center"><div className="w-full max-w-10 rounded-t-md bg-violet/85 transition-colors group-hover:bg-violet" style={{ height: `${value > 0 ? Math.max(3, value / max * 100) : 0}%` }} title={`${point.label}: ${value.toLocaleString("en-IN")} ${metric}`} />{(series.length <= 7 || index % Math.ceil(series.length / 7) === 0 || index === series.length - 1) && <span className="absolute -bottom-5 max-w-full truncate text-[9px] text-text-2">{point.label}</span>}</div>; })}
        </div>
        <div className="mt-8 flex items-center justify-between text-[10px] text-text-2"><span>{series[0]?.label ?? "—"}</span><span>{compact(max)} {metric}</span><span>{series.at(-1)?.label ?? "—"}</span></div>
      </div>
    </section>
  );
}

function compact(value: number) { return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
