import type { Metadata } from "next";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, users } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { currencyMinorDigits } from "@/lib/currency";

export const metadata: Metadata = { title: "Payment review · Admin" };

export default async function PaymentReviewPage() {
  await connection();
  const rows = await db.select({
    id: payments.id,
    amountPaise: payments.amountPaise,
    currency: payments.currency,
    provider: payments.provider,
    reference: payments.reference,
    metadata: payments.metadata,
    createdAt: payments.createdAt,
    email: users.email,
    name: users.name,
  }).from(payments).leftJoin(users, eq(users.id, payments.userId))
    .where(eq(payments.status, "needs_review")).orderBy(desc(payments.updatedAt)).limit(200);

  return <div className="flex flex-col gap-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet">Admin</p><h1 className="mt-2 text-2xl font-semibold text-text-0">Payment review</h1><p className="mt-1 text-sm text-text-2">Late or mismatched captured payments are held here without automatically crediting a wallet.</p></header>
    <Card className="glass border-line"><CardHeader><CardTitle className="flex items-center justify-between text-base"><span>Needs review</span><Badge variant={rows.length ? "warn" : "success"}>{rows.length}</Badge></CardTitle></CardHeader><CardContent>
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-line text-[10px] uppercase tracking-wider text-text-2"><th className="pb-3 pr-4">Customer</th><th className="pb-3 pr-4">Amount</th><th className="pb-3 pr-4">Reason</th><th className="pb-3 pr-4">Order reference</th><th className="pb-3">Received</th></tr></thead><tbody>{rows.map((row) => {
        const details = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
        const amount = row.amountPaise / (10 ** currencyMinorDigits(row.currency));
        return <tr key={row.id} className="border-b border-line/60 last:border-0"><td className="py-3 pr-4"><span className="block font-medium text-text-0">{row.name ?? "Deleted account"}</span><span className="text-xs text-text-2">{row.email ?? "—"}</span></td><td className="py-3 pr-4 font-mono tabular-nums text-text-0">{new Intl.NumberFormat("en", { style: "currency", currency: row.currency }).format(amount)}</td><td className="py-3 pr-4"><Badge variant="warn">{String(details.reviewReason ?? "manual_review").replaceAll("_", " ")}</Badge><span className="mt-1 block text-[10px] text-text-2">UTR: {String(details.utr ?? "not submitted")}</span></td><td className="py-3 pr-4 font-mono text-xs text-text-1">{String(details.displayReference ?? row.reference ?? row.id)}</td><td className="py-3 text-xs text-text-2">{row.createdAt.toLocaleString("en-IN", { timeZone: "UTC" })} UTC</td></tr>;
      })}</tbody></table></div> : <p className="py-10 text-center text-sm text-text-2">No payments are waiting for review.</p>}
    </CardContent></Card>
  </div>;
}
