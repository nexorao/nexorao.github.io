import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";
import { RazorpayError, razorpayRequest, settleRazorpayPayment, verifyRazorpayHmac } from "@/lib/payments/razorpay";
import { PayloadTooLargeError, readRequestTextLimited } from "@/lib/http";

const schema = z.object({ razorpay_order_id: z.string().min(5).max(80), razorpay_payment_id: z.string().min(5).max(80), razorpay_signature: z.string().length(64) });

export async function POST(request: Request) {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to continue." : "Authentication required." }, { status: 401 });
  }
  let raw: unknown;
  try { raw = JSON.parse(await readRequestTextLimited(request, 4_000)); }
  catch (error) { return Response.json({ error: error instanceof PayloadTooLargeError ? error.message : "Invalid request." }, { status: error instanceof PayloadTooLargeError ? 413 : 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Payment verification details are invalid." }, { status: 400 });
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !verifyRazorpayHmac(`${orderId}|${paymentId}`, signature, secret)) {
    return Response.json({ error: "Payment signature could not be verified." }, { status: 400 });
  }
  const [order] = await db.select({ id: payments.id }).from(payments).where(and(
    eq(payments.userId, user.id), eq(payments.provider, "razorpay"), eq(payments.reference, orderId),
  )).limit(1);
  if (!order) return Response.json({ error: "Payment order not found for this account." }, { status: 404 });
  try {
    let captured = await razorpayRequest<{ id: string; order_id: string; amount: number; currency: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}`, "GET");
    if (captured.status === "authorized") {
      captured = await razorpayRequest<{ id: string; order_id: string; amount: number; currency: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}/capture`, "POST", { amount: captured.amount, currency: captured.currency });
    }
    const settled = await settleRazorpayPayment(orderId, captured);
    return Response.json({ ok: true, paymentId: settled.paymentId, alreadyPaid: settled.alreadyPaid }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[payments] checkout verification failed", error);
    return Response.json({ error: error instanceof RazorpayError ? error.message : "The payment has not been confirmed yet. Refresh your wallet in a moment." }, { status: error instanceof RazorpayError ? error.status : 502 });
  }
}
