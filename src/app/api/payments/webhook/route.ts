import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, webhookEvents } from "@/db/schema";
import { hashToken } from "@/lib/crypto/password";
import { RazorpayError, settleRazorpayPayment, verifyRazorpayHmac } from "@/lib/payments/razorpay";
import { PayloadTooLargeError, readRequestTextLimited } from "@/lib/http";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  let raw: string;
  try { raw = await readRequestTextLimited(request, 1_000_000); }
  catch (error) { return Response.json({ error: error instanceof PayloadTooLargeError ? error.message : "Could not read webhook body." }, { status: error instanceof PayloadTooLargeError ? 413 : 400 }); }
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyRazorpayHmac(raw, signature, secret)) return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  let payload: Record<string, unknown>;
  try { payload = record(JSON.parse(raw)); } catch { return Response.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  const event = typeof payload.event === "string" ? payload.event : "";
  const eventId = (request.headers.get("x-razorpay-event-id") ?? `body:${hashToken(raw)}`).slice(0, 200);
  const [inserted] = await db.insert(webhookEvents).values({ provider: "razorpay", eventId, payload, status: "received" })
    .onConflictDoNothing().returning({ id: webhookEvents.id });
  let webhookId = inserted?.id;
  if (!webhookId) {
    const [existing] = await db.select({ id: webhookEvents.id, status: webhookEvents.status }).from(webhookEvents)
      .where(and(eq(webhookEvents.provider, "razorpay"), eq(webhookEvents.eventId, eventId))).limit(1);
    if (existing?.status === "processed") return Response.json({ ok: true, duplicate: true });
    webhookId = existing?.id;
  }
  if (!webhookId) return Response.json({ error: "Could not record webhook event." }, { status: 500 });

  try {
    if (event === "payment.captured" || event === "qr_code.credited") {
      const eventPayload = record(payload.payload);
      const payment = record(eventPayload.payment);
      const entity = record(payment.entity);
      const qrCode = record(eventPayload.qr_code);
      const qrEntity = record(qrCode.entity);
      const orderId = typeof entity.order_id === "string" ? entity.order_id : "";
      const qrCodeId = typeof entity.qr_code_id === "string" ? entity.qr_code_id : typeof qrEntity.id === "string" ? qrEntity.id : "";
      if ((!orderId && !qrCodeId) || typeof entity.id !== "string" || typeof entity.amount !== "number" || typeof entity.currency !== "string") {
        throw new RazorpayError("Captured payment event is missing required fields.");
      }
      await settleRazorpayPayment(orderId || qrCodeId, {
        id: entity.id, order_id: orderId, qr_code_id: qrCodeId || null, amount: entity.amount, currency: entity.currency,
        status: typeof entity.status === "string" ? entity.status : "captured",
      });
    } else if (event === "payment.failed") {
      const entity = record(record(record(payload.payload).payment).entity);
      const orderId = typeof entity.order_id === "string" ? entity.order_id : "";
      if (orderId) await db.update(payments).set({ status: "failed", updatedAt: new Date() })
        .where(and(eq(payments.provider, "razorpay"), eq(payments.reference, orderId), eq(payments.status, "created")));
    }
    await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.id, webhookId));
    return Response.json({ ok: true });
  } catch (error) {
    await db.update(webhookEvents).set({ status: "failed" }).where(eq(webhookEvents.id, webhookId));
    console.error("[payments] webhook processing failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Webhook processing failed." }, { status: 400 });
  }
}
