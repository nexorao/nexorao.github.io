import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { db } from "@/db";
import { payments, topupPacks } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, TransactionsTable, BUCKET_LABELS } from "@/components/dashboard/kit";
import { formatCredits } from "@/lib/format";
import { WalletPackGrid } from "@/app/dashboard/wallet-pack-grid";
import { getCurrentUser } from "@/lib/auth/session";
import { razorpayConfigured } from "@/lib/payments/razorpay";
import {
  getHeldTotal,
  getOrCreateWallet,
  listActiveBuckets,
  listTransactions,
  verifyLedger,
} from "@/lib/wallet";

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage() {
  return (
    <Suspense fallback={<WalletSkeleton />}>
      <WalletContent />
    </Suspense>
  );
}

async function WalletContent() {
  await connection();
  const user = await getCurrentUser();
  const wallet = await getOrCreateWallet(user.id);
  const buckets = await listActiveBuckets(wallet.id);
  const balance = buckets.reduce((acc, b) => acc + Number(b.credits), 0);
  const held = await getHeldTotal(wallet.id);
  const txs = await listTransactions(user.id, 30);
  const ledger = await verifyLedger(wallet.id);
  const packs = await db
    .select()
    .from(topupPacks)
    .where(eq(topupPacks.active, true))
    .orderBy(topupPacks.sortOrder);
  const receipts = await db.select().from(payments).where(and(eq(payments.userId, user.id), eq(payments.status, "paid")))
    .orderBy(desc(payments.createdAt)).limit(12);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight text-text-0">Balance &amp; top-up</h1><p className="mt-1.5 max-w-3xl text-sm leading-6 text-text-1">Manage credits for plans and model usage. Your chat requests only use credits from this wallet.</p></div>
        <div className="flex gap-2"><Button asChild variant="outline"><Link href="/dashboard/subscription">View plans</Link></Button><Button asChild><Link href="/dashboard/wallet/top-up" prefetch>＋ Add balance</Link></Button></div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.9fr_1fr]">
        <section className="glass relative overflow-hidden rounded-2xl border border-line p-6 sm:p-7">
          <div className="absolute -right-10 -top-24 size-72 rounded-full bg-violet/20 blur-3xl" aria-hidden />
          <div className="relative"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-2">Available credits</p><p className="mt-3 text-5xl font-semibold tracking-tight text-text-0">{formatCredits(balance)}</p><p className="mt-2 text-sm text-text-1">{held > 0 ? `${formatCredits(held)} credits are reserved for in-progress requests.` : "Your balance is ready for chat and model usage."}</p>
            <WalletPackGrid packs={packs} />
          </div>
        </section>

        <section className="glass overflow-hidden rounded-2xl border border-line">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-semibold text-text-0">Payment methods</h2><p className="mt-0.5 text-xs text-text-2">Secure online checkout</p></div><Badge variant={razorpayConfigured() ? "success" : "warn"}>{razorpayConfigured() ? "Razorpay connected" : "Gateway setup required"}</Badge></div>
          <div className="divide-y divide-line">
            <PaymentRow icon="₹" title="UPI and local payment methods" description="Razorpay Checkout presents UPI, cards and local payment methods available in your region." state={razorpayConfigured() ? "Razorpay Checkout" : "Gateway setup required"} />
            <PaymentRow icon="$" title="International payments" description="Razorpay accepts international payments. Prices are automatically converted to your detected local currency at checkout." state={razorpayConfigured() ? "Razorpay Checkout" : "Gateway setup required"} />
          </div>
          <p className="px-5 py-4 text-xs leading-5 text-text-2">Payments are confirmed server-side before credits are added. Razorpay shows the final amount and supported methods for your location. A receipt is available from your transactions after a successful payment.</p>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Balance" value={`${formatCredits(balance)} credits`} tone="accent" />
        <StatCard label="On hold" value={formatCredits(held)} hint="reserved for running requests" />
        <StatCard label="Active buckets" value={String(buckets.length)} hint="daily, subscription or purchased" />
        <StatCard label="Transactions" value={String(txs.length)} hint="latest 30 shown below" />
      </div>

      <Card className="glass overflow-hidden">
        <CardHeader className="border-b border-line"><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent className="pt-4"><TransactionsTable transactions={txs} /></CardContent>
      </Card>

      <Card className="glass overflow-hidden">
        <CardHeader className="border-b border-line"><CardTitle>Payment receipts</CardTitle></CardHeader>
        <CardContent className="pt-4"><div className="flex flex-col divide-y divide-line">{receipts.length ? receipts.map((payment) => {
          const metadata = payment.metadata && typeof payment.metadata === "object" ? payment.metadata as Record<string, unknown> : {};
          const description = typeof metadata.description === "string" ? metadata.description : payment.kind === "topup" ? "Credit top-up" : "Plan purchase";
          return <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"><div><p className="text-sm font-medium text-text-0">{description}</p><p className="mt-1 text-xs text-text-2">{payment.createdAt.toLocaleString("en-IN")} · {payment.reference ?? payment.id}</p></div><a href={`/api/payments/${payment.id}/invoice`} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-text-0 hover:bg-[var(--glass-bg-hover)]">Open receipt</a></div>;
        }) : <p className="py-2 text-sm text-text-2">No completed payments yet.</p>}</div></CardContent>
      </Card>

      <Card className="glass overflow-hidden">
        <CardHeader><CardTitle>Credit buckets</CardTitle></CardHeader>
        <CardContent><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-text-2"><th className="py-2 pr-3 font-medium">Type</th><th className="py-2 pr-3 font-medium">Source</th><th className="py-2 pr-3 font-medium">Expires (UTC)</th><th className="py-2 text-right font-medium">Credits</th></tr></thead><tbody>{buckets.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-sm text-text-2">No active buckets yet.</td></tr> : buckets.map((b) => <tr key={b.id} className="border-b border-line/50 last:border-0"><td className="py-2.5 pr-3 text-text-0">{BUCKET_LABELS[b.type] ?? b.type}</td><td className="py-2.5 pr-3 font-mono text-xs text-text-2">{b.sourceRef ? `${b.sourceRef.slice(0, 8)}…` : b.type === "daily_free" ? "daily allowance" : "—"}</td><td className="py-2.5 pr-3 text-text-1">{b.expiresAt ? b.expiresAt.toLocaleString("en-IN", { timeZone: "UTC" }) : "never"}</td><td className="py-2.5 text-right font-mono tabular-nums text-text-0">{formatCredits(Number(b.credits))}</td></tr>)}</tbody></table></div><Badge variant={ledger.ok ? "success" : "danger"} className="mt-4">{ledger.ok ? "Ledger verified" : "Ledger mismatch detected — contact support"}</Badge><p className="mt-2 text-xs text-text-2">Successful payments are reflected in the transaction ledger.</p></CardContent>
      </Card>
    </div>
  );
}

function PaymentRow({ icon, title, description, state }: { icon: string; title: string; description: string; state: string }) {
  return <div className="flex items-center gap-3 px-5 py-4"><span className="grid size-9 place-items-center rounded-xl bg-bg-1 font-semibold text-success">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text-0">{title}</span><span className="mt-0.5 block text-xs text-text-2">{description}</span></span><span className="rounded-full bg-[var(--glass-bg)] px-2 py-1 text-[10px] font-semibold text-text-1">{state}</span></div>;
}

function WalletSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-56" />
      <Skeleton className="h-72" />
    </div>
  );
}
