"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { formatLocalPrice, useCurrency } from "@/components/currency/currency-provider";

type Plan = { id: string; name: string; tagline: string; pricePaiseMonthly: number; annualMonthsCharged: number; monthlyCredits: number };

export function PlanActivationButton({ plan, unusedSubscriptionCredits = 0, current = false }: { plan: Plan; unusedSubscriptionCredits?: number; current?: boolean }) {
  const [open, setOpen] = useState(false);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const currency = useCurrency();
  const totalInr = (plan.pricePaiseMonthly * (cycle === "annual" ? plan.annualMonthsCharged : 1)) / 100;
  const checkoutHref = `/checkout/start?kind=subscription&plan=${encodeURIComponent(plan.id)}&cycle=${cycle}`;

  return <>
    <button type="button" disabled={current} onClick={() => setOpen(true)} className={`inline-flex h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold disabled:cursor-default disabled:opacity-60 ${current ? "border border-line text-text-2" : "bg-text-0 text-bg-0 shadow-[0_8px_24px_rgba(127,92,255,.18)]"}`}>{current ? "Your current plan" : `Choose ${plan.name}`}</button>
    {open && typeof document !== "undefined" ? createPortal(<div className="fixed inset-0 z-[75] grid place-items-center bg-black/65 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="activate-plan-title" className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-bg-1 shadow-2xl">
      <header className="flex items-start justify-between border-b border-line px-5 py-4"><div><h2 id="activate-plan-title" className="font-semibold text-text-0">Choose {plan.name}</h2><p className="mt-1 text-xs text-text-2">{plan.tagline || "For your Nexora projects."}</p></div><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-text-2 hover:text-text-0"><X className="size-4" /></button></header>
      <div className="max-h-[75dvh] space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={cycle === "monthly"} onClick={() => setCycle("monthly")} className={`rounded-xl border p-3 text-left ${cycle === "monthly" ? "border-violet bg-violet/5" : "border-line"}`}><span className="block text-xs font-semibold text-text-0">Monthly</span><span className="mt-1 block text-xs text-text-2">{formatLocalPrice(plan.pricePaiseMonthly / 100, currency)} / month</span></button><button type="button" aria-pressed={cycle === "annual"} onClick={() => setCycle("annual")} className={`rounded-xl border p-3 text-left ${cycle === "annual" ? "border-violet bg-violet/5" : "border-line"}`}><span className="block text-xs font-semibold text-text-0">Yearly</span><span className="mt-1 block text-xs text-text-2">{formatLocalPrice((plan.pricePaiseMonthly * plan.annualMonthsCharged) / 100, currency)} / year</span></button></div>
        <div className="rounded-xl border border-line bg-bg-0/65 p-4 text-sm"><PriceRow label="You pay" value={formatLocalPrice(totalInr, currency)} /><PriceRow label="Included allowance" value={`${Number(plan.monthlyCredits).toLocaleString("en-IN")} credits / month`} /><div className="mt-2 border-t border-dashed border-line pt-2 text-xs leading-relaxed text-text-2"><Check className="mr-1.5 inline size-3.5 text-success" aria-hidden />Your {unusedSubscriptionCredits.toLocaleString("en-IN")} unused subscription credits carry over. The new period starts after payment confirmation.</div></div>
        <p className="text-xs leading-relaxed text-text-2">Payment methods depend on your location and merchant settings. The final amount and available options appear in secure Razorpay checkout.</p>
        <div className="flex justify-end gap-2 border-t border-line pt-4"><button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-text-2 hover:text-text-0">Cancel</button><Link href={checkoutHref} className="inline-flex min-w-40 items-center justify-center rounded-xl bg-text-0 px-4 py-2.5 text-sm font-semibold text-bg-0">Continue to checkout</Link></div>
      </div>
    </section></div>, document.body) : null}
  </>;
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-text-1">{label}</span><span className="font-mono font-semibold tabular-nums text-text-0">{value}</span></div>;
}
