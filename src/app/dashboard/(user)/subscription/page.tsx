import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CancelSubscriptionButton } from "./cancel-subscription-button";
import { formatCredits } from "@/lib/format";
import { LocalizedPrice } from "@/components/currency/localized-price";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveSubscription, getPlan, listPlans } from "@/lib/subscriptions";
import { PlanActivationButton } from "@/app/dashboard/plan-activation-modal";
import { getOrCreateWallet, listActiveBuckets } from "@/lib/wallet";

export const metadata: Metadata = { title: "Subscription" };

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<SubscriptionSkeleton />}>
      <SubscriptionContent />
    </Suspense>
  );
}

async function SubscriptionContent() {
  // Subscription eligibility depends on the current time. Keep this work
  // request-bound instead of evaluating `new Date()` during prerendering.
  await connection();

  const user = await getCurrentUser();
  const [sub, wallet] = await Promise.all([getActiveSubscription(user.id), getOrCreateWallet(user.id)]);
  const plan = sub ? await getPlan(sub.planId) : null;
  const allPlans = (await listPlans()).filter((p) => p.active);
  const currentPlan = plan ?? allPlans.find((p) => p.id === "free") ?? null;
  const buckets = await listActiveBuckets(wallet.id);
  const unusedSubscriptionCredits = buckets.filter((bucket) => bucket.type === "subscription").reduce((sum, bucket) => sum + Number(bucket.credits), 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight text-text-0">Plans</h1><p className="mt-1.5 text-sm text-text-1">Every plan reaches the model catalog. Paid terms are prepaid at checkout and do not auto-renew.</p></div>
        <Link href="/dashboard/wallet/top-up" prefetch className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-text-0 transition-colors hover:bg-[var(--glass-bg-hover)]">Add balance</Link>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.9fr_1fr]">
        <Card className="glass relative overflow-hidden border-line p-6 sm:p-7">
          <div className="absolute -right-12 -top-24 size-72 rounded-full bg-violet/20 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-2">Current plan</p><h2 className="mt-2 text-3xl font-semibold text-text-0">{currentPlan?.name ?? "Free"}</h2><p className="mt-1 text-sm text-text-1">{currentPlan?.tagline ?? "Free tier — upgrade any time"}</p></div>
            <div className="text-right"><p className="text-xs text-text-2">Plan price</p>{currentPlan?.pricePaiseMonthly ? <div className="mt-1 flex items-baseline gap-1"><LocalizedPrice inrAmount={currentPlan.pricePaiseMonthly / 100} className="text-2xl font-semibold text-text-0" /><span className="text-sm text-text-2">/ mo</span></div> : <p className="mt-1 text-2xl font-semibold text-text-0">Free</p>}</div>
          </div>
          <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="max-w-2xl text-sm leading-6 text-text-1">{sub && plan ? `${formatCredits(Number(plan.monthlyCredits))} credits per month · renews ${sub.currentPeriodEnd.toLocaleDateString("en-IN", { timeZone: "UTC" })}.` : "Daily free credits are available. Choose a plan below whenever you are ready."}</p>
            {sub && !sub.cancelAtPeriodEnd ? <CancelSubscriptionButton /> : <Badge variant="accent">{sub?.cancelAtPeriodEnd ? "Ending soon" : "Free tier"}</Badge>}
          </div>
        </Card>
        <section className="glass rounded-2xl border border-line p-5">
          <h2 className="font-semibold text-text-0">Good to know</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm leading-6 text-text-1">
            <li>✓ Plan prices and credit allowances are managed by NEXORAO.</li>
            <li>✓ Chat usage is charged from credits shown in your wallet.</li>
            <li>✓ Paid terms are prepaid; automatic renewal is not enabled.</li>
            <li>✓ Check payments and receipts in Balance &amp; top-up.</li>
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold tracking-tight text-text-0">Plans</h2><p className="text-xs text-text-2">Choose monthly or annual billing in the activation window.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {allPlans.map((p) => {
          const isCurrent = currentPlan?.id === p.id;
          const quota = Number(p.monthlyCredits) > 0 ? `${formatCredits(Number(p.monthlyCredits))} credits` : `${formatCredits(Number(p.dailyFreeCredits))} credits daily`;
          return <section key={p.id} className={`flex flex-col rounded-2xl border p-5 ${isCurrent ? "border-violet/60 bg-violet/5 shadow-[0_0_0_1px_rgba(139,92,246,.15)]" : "glass border-line"}`}>
            <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-text-0">{p.name}</h3>{isCurrent ? <Badge variant="accent">Current</Badge> : p.popular ? <Badge variant="success">Popular</Badge> : null}</div>
            <p className="mt-4 flex items-baseline gap-1 text-3xl font-semibold tracking-tight text-text-0">{p.pricePaiseMonthly > 0 ? <LocalizedPrice inrAmount={p.pricePaiseMonthly / 100} className="text-3xl font-semibold tracking-tight text-text-0" /> : "Free"}<span className="ml-1 text-sm font-normal text-text-2">{p.pricePaiseMonthly > 0 ? "/ month" : ""}</span></p>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-bg-1 px-3 py-2.5"><span className="text-sm font-semibold text-text-0">{quota}</span><span className="text-xs text-text-2">credits</span></div>
            <ul className="mt-4 flex flex-1 flex-col gap-2.5 text-sm text-text-1">{p.highlights.map((feature) => <li key={feature} className="flex gap-2"><span className="text-success">✓</span><span>{feature}</span></li>)}</ul>
            <p className="mt-4 text-xs text-text-2">{p.tagline}</p>
            {isCurrent ? <div className="mt-4 rounded-xl border border-line px-3 py-2.5 text-center text-sm font-semibold text-text-2">Your current plan</div> : p.pricePaiseMonthly > 0 ? <div className="mt-4"><PlanActivationButton plan={{ id: p.id ?? "", name: p.name ?? "Plan", tagline: p.tagline ?? "", pricePaiseMonthly: p.pricePaiseMonthly, annualMonthsCharged: p.annualMonthsCharged, monthlyCredits: Number(p.monthlyCredits) }} unusedSubscriptionCredits={unusedSubscriptionCredits} /></div> : <div className="mt-4 rounded-xl border border-line px-3 py-2.5 text-center text-sm text-text-2">Free tier</div>}
          </section>;
        })}
      </div>
      <p className="text-xs leading-5 text-text-2">Plan pricing is loaded from the admin-configured catalog. Yearly plans are prepaid for 12 months; the displayed annual price reflects the configured charged-month count.</p>
    </div>
  );
}

function SubscriptionSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-52" />
      <Skeleton className="h-80" />
    </div>
  );
}
