import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";
import { currencyLocale, currencyMinorDigits } from "@/lib/currency";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to continue." : "Authentication required." }, { status: 401 });
  }
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Paid receipt not found." }, { status: 404 });
  const [payment] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, user.id), eq(payments.status, "paid"))).limit(1);
  if (!payment) return Response.json({ error: "Paid receipt not found." }, { status: 404 });
  const meta = payment.metadata && typeof payment.metadata === "object" ? payment.metadata as Record<string, unknown> : {};
  const description = typeof meta.description === "string" ? meta.description : payment.kind === "topup" ? "NEXORAO wallet credit top-up" : "NEXORAO subscription";
  const paymentRef = typeof meta.providerPaymentId === "string" ? meta.providerPaymentId : payment.reference ?? payment.id;
  const date = payment.updatedAt.toISOString();
  const amount = payment.amountPaise / (10 ** currencyMinorDigits(payment.currency));
  const country = typeof meta.country === "string" ? meta.country : "US";
  const paidAmount = amount.toLocaleString(currencyLocale(country, payment.currency), { style: "currency", currency: payment.currency });
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXORAO payment receipt</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#16141c;background:#f4f2f8;margin:0;padding:32px}.sheet{max-width:720px;margin:auto;background:white;border:1px solid #ddd8e8;border-radius:20px;padding:40px;box-shadow:0 20px 60px #21183a12}.brand{font-size:14px;font-weight:700;letter-spacing:.18em;color:#7554dc}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #e9e5ef;padding-bottom:24px}.muted{color:#706a7c}.total{font-size:34px;font-weight:700}.row{display:flex;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid #eeeaf3}.foot{margin-top:28px}.print{background:#211a31;color:white;border:0;padding:11px 18px;border-radius:10px;font-weight:600;cursor:pointer}@media print{body{background:white;padding:0}.sheet{box-shadow:none;border:0}}</style><body><main class="sheet"><header class="head"><div><div class="brand">NEXORAO</div><h1>Payment receipt</h1><div class="muted">Receipt ${escapeHtml(payment.id)}</div></div><div><div class="muted">Paid on</div><strong>${escapeHtml(date)}</strong></div></header><section style="padding:24px 0"><div class="muted">Paid amount</div><div class="total">${escapeHtml(paidAmount)}</div></section><div class="row"><span class="muted">Description</span><strong>${escapeHtml(description)}</strong></div><div class="row"><span class="muted">Payment method</span><strong>Razorpay</strong></div><div class="row"><span class="muted">Payment reference</span><strong>${escapeHtml(paymentRef)}</strong></div><div class="row"><span class="muted">Account</span><strong>${escapeHtml(user.email)}</strong></div><footer class="foot"><p class="muted">This receipt confirms a successful NEXORAO payment. Contact support with the receipt reference if you need help.</p><button class="print" onclick="window.print()">Print / Save as PDF</button></footer></main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `inline; filename="nexorao-receipt-${payment.id}.html"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
