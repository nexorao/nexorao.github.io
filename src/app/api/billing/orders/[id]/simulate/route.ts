import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";
import { settleRazorpayPayment } from "@/lib/payments/razorpay";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Payment simulation is disabled in production." }, { status: 404 });
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to continue." : "Authentication required." }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Order not found." }, { status: 404 });
  const [order] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, user.id), eq(payments.provider, "mock"))).limit(1);
  if (!order?.reference) return Response.json({ error: "Development order not found." }, { status: 404 });
  const result = await settleRazorpayPayment(order.reference, {
    id: `dev_payment_${order.id}`, order_id: order.reference, amount: order.amountPaise, currency: order.currency, status: "captured",
  }, "mock");
  return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
}
