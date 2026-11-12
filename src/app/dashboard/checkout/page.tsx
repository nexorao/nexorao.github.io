import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, topupPacks } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { PaymentCheckoutButton } from "@/app/dashboard/payment-checkout-button";
import { LocalizedCheckoutPrice } from "@/components/currency/localized-checkout-price";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Secure checkout" };

type CheckoutParams = { kind?: string; plan?: string; pack?: string; cycle?: string };

export default function CheckoutPage({ searchParams }: { searchParams: Promise<CheckoutParams> }) {
  return <Suspense fallback={<CheckoutSkeleton />}><CheckoutContent searchParams={searchParams} /></Suspense>;
}

function CheckoutSkeleton() {
  return <section className="mx-auto mt-8 w-full max-w-2xl space-y-5 rounded-2xl border border-line bg-bg-1 p-6"><Skeleton className="h-20" /><Skeleton className="h-28" /><Skeleton className="h-12" /></section>;
}

async function CheckoutContent({ searchParams }: { searchParams: Promise<CheckoutParams> }) {
  await connection();
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (params.kind === "subscription" && params.plan) {
    const cycle = params.cycle === "annual" ? "annual" : "monthly";
    const [plan] = await db.select().from(plans).where(and(eq(plans.id, params.plan), eq(plans.active, true))).limit(1);
    if (!plan || plan.pricePaiseMonthly <= 0) notFound();
    const baseAmountInr = (plan.pricePaiseMonthly * (cycle === "annual" ? plan.annualMonthsCharged : 1)) / 100;
    return <CheckoutCard
      title={`${plan.name} plan`}
      description={`${cycle === "annual" ? "Annual" : "Monthly"} plan · ${Number(plan.monthlyCredits).toLocaleString("en-IN")} credits per month`}
      amountInr={baseAmountInr}
      account={user.email}
      input={{ kind: "subscription", planId: plan.id, billingCycle: cycle }}
      backHref="/dashboard/subscription"
    />;
  }
  if (params.kind === "topup" && params.pack) {
    const [pack] = await db.select().from(topupPacks).where(and(eq(topupPacks.id, params.pack), eq(topupPacks.active, true))).limit(1);
    if (!pack || pack.pricePaise <= 0) notFound();
    return <CheckoutCard
      title={`${pack.name} credit pack`}
      description={`${Number(pack.credits + pack.bonusCredits).toLocaleString("en-IN")} wallet credits`}
      amountInr={pack.pricePaise / 100}
      account={user.email}
      input={{ kind: "topup", packId: pack.id }}
      backHref="/pricing"
    />;
  }
  notFound();
}

function CheckoutCard({ title, description, amountInr, account, input, backHref }: {
  title: string;
  description: string;
  amountInr: number;
  account: string;
  input: { kind: "subscription"; planId: string; billingCycle: "monthly" | "annual" } | { kind: "topup"; packId: string };
  backHref: string;
}) {
  return <section className="mx-auto mt-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-bg-1 shadow-[var(--shadow-glass)]">
    <header className="border-b border-line px-6 py-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet">NEXORAO secure checkout</p><h1 className="mt-2 text-2xl font-semibold text-text-0">Review your order</h1><p className="mt-1 text-sm text-text-2">Razorpay securely handles the payment details.</p></header>
    <div className="space-y-5 p-6">
      <div className="rounded-xl border border-line bg-bg-0/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-text-0">{title}</p><p className="mt-1 text-xs text-text-2">{description}</p></div><div className="text-right"><LocalizedCheckoutPrice inrAmount={amountInr} /><p className="mt-1 text-[10px] text-text-2">Estimated local price · exact amount shown in Razorpay</p></div></div><p className="mt-4 border-t border-line pt-3 text-xs text-text-2">Account: {account}</p></div>
      <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-xs leading-5 text-text-1">Razorpay securely accepts domestic and international payments. Your price is automatically shown in your local currency, and checkout presents the payment methods available for your region, including UPI for customers in India.</div>
      <PaymentCheckoutButton input={input} label="Continue to secure payment" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-text-0 px-5 text-sm font-semibold text-bg-0 shadow-[0_8px_24px_rgba(127,92,255,.18)] disabled:opacity-60" />
      <Button variant="glass" asChild className="w-full"><Link href={backHref}>Back</Link></Button>
    </div>
  </section>;
}
