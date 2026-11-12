import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payments, plans, subscriptions, topupPacks, userNotifications, userPreferences, walletBuckets, walletTransactions, wallets } from "@/db/schema";
import { periodEndFor } from "@/lib/subscriptions";

export class RazorpayError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = "RazorpayError"; }
}

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function razorpayWebhookConfigured() {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET ?? process.env.PAYMENT_WEBHOOK_SECRET);
}

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new RazorpayError("Razorpay checkout is not configured.", 503);
  return { keyId, keySecret };
}

export async function razorpayRequest<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { description?: string } };
  if (!response.ok) throw new RazorpayError(payload.error?.description ?? `Razorpay request failed (${response.status}).`, response.status >= 500 ? 502 : 400);
  return payload;
}

export function verifyRazorpayHmac(message: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  const provided = Buffer.from(signature, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

type CapturedPayment = { id: string; order_id?: string | null; qr_code_id?: string | null; amount: number; currency: string; status: string };

/** Applies entitlements and marks the payment in one transaction; safe for webhook retries. */
export async function settleRazorpayPayment(orderId: string, captured: CapturedPayment, provider: "razorpay" | "mock" = "razorpay") {
  const reference = captured.qr_code_id || orderId;
  const validReference = captured.qr_code_id ? captured.qr_code_id === orderId : captured.order_id === orderId;
  if (captured.status !== "captured" || !validReference) throw new RazorpayError("The payment is not captured for this order.");
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(and(eq(payments.provider, provider), eq(payments.reference, reference))).for("update").limit(1);
    if (!payment) throw new RazorpayError("Payment order not found.", 404);
    if (payment.status === "paid") return { alreadyPaid: true, paymentId: payment.id };
    const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
    if (payment.status !== "created") {
      await tx.update(payments).set({ status: "needs_review", metadata: { ...metadata, reviewReason: "payment_after_order_closed", providerPaymentId: captured.id }, updatedAt: new Date() }).where(eq(payments.id, payment.id));
      return { alreadyPaid: false, needsReview: true, paymentId: payment.id };
    }
    const expiresAt = typeof metadata.expiresAt === "string" ? new Date(metadata.expiresAt) : null;
    const expired = expiresAt !== null && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now();
    const mismatched = payment.currency !== captured.currency || payment.amountPaise !== captured.amount;
    if (expired || mismatched) {
      await tx.update(payments).set({
        status: "needs_review",
        metadata: { ...metadata, reviewReason: expired ? "late_payment" : "amount_mismatch", capturedAmount: captured.amount, capturedCurrency: captured.currency, providerPaymentId: captured.id },
        updatedAt: new Date(),
      }).where(eq(payments.id, payment.id));
      return { alreadyPaid: false, needsReview: true, paymentId: payment.id };
    }
    if (payment.userId === null) throw new RazorpayError("Payment owner could not be verified.");
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, payment.userId)).limit(1);
    const actualWallet = wallet ?? (await tx.insert(wallets).values({ userId: payment.userId }).returning())[0];
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('wallet:' || ${actualWallet.id}))`);

    if (payment.kind === "topup") {
      if (metadata.customTopup === true) {
        const creditedCredits = Number(metadata.creditedCredits);
        if (!Number.isSafeInteger(creditedCredits) || creditedCredits <= 0) throw new RazorpayError("The top-up amount could not be verified.");
        await grantPaidCredits(tx, actualWallet.id, payment.userId, creditedCredits, "purchased", "purchase", payment.id);
      } else {
        const packId = String(metadata.packId ?? "");
        const [pack] = await tx.select().from(topupPacks).where(and(eq(topupPacks.id, packId), eq(topupPacks.active, true))).limit(1);
        const baseAmountPaise = Number(metadata.baseAmountPaise ?? payment.amountPaise);
        if (!pack || pack.pricePaise !== baseAmountPaise) throw new RazorpayError("The top-up pack no longer matches this order.");
        await grantPaidCredits(tx, actualWallet.id, payment.userId, Number(pack.credits) + Number(pack.bonusCredits), "purchased", "purchase", payment.id);
      }
    } else {
      const planId = String(metadata.planId ?? "");
      const cycle = metadata.billingCycle === "annual" ? "annual" : "monthly";
      const [plan] = await tx.select().from(plans).where(and(eq(plans.id, planId), eq(plans.active, true))).limit(1);
      const expectedPrice = plan ? plan.pricePaiseMonthly * (cycle === "annual" ? plan.annualMonthsCharged : 1) : -1;
      const baseAmountPaise = Number(metadata.baseAmountPaise ?? payment.amountPaise);
      if (!plan || plan.pricePaiseMonthly <= 0 || expectedPrice !== baseAmountPaise) throw new RazorpayError("The plan price no longer matches this order.");
      const now = new Date();
      const end = periodEndFor(cycle, now);
      await tx.update(subscriptions).set({ status: "canceled", updatedAt: now }).where(and(eq(subscriptions.userId, payment.userId), eq(subscriptions.status, "active")));
      const [subscription] = await tx.insert(subscriptions).values({
        userId: payment.userId, planId: plan.id, status: "active", billingCycle: cycle,
        currentPeriodStart: now, currentPeriodEnd: end, source: "razorpay", metadata: { paymentId: payment.id },
      }).returning({ id: subscriptions.id });
      const credits = Number(plan.monthlyCredits) * (cycle === "annual" ? 12 : 1);
      if (credits > 0) await grantPaidCredits(tx, actualWallet.id, payment.userId, credits, "subscription", "subscription_grant", payment.id, end, subscription.id);
    }
    await tx.update(payments).set({ status: "paid", metadata: { ...metadata, providerPaymentId: captured.id }, updatedAt: new Date() }).where(eq(payments.id, payment.id));
    const [preferences] = await tx.select({ notifications: userPreferences.notifications }).from(userPreferences).where(eq(userPreferences.userId, payment.userId)).limit(1);
    if (preferences?.notifications.paymentReceipts !== false) {
      await tx.insert(userNotifications).values({
        userId: payment.userId,
        category: "alert",
        title: payment.kind === "topup" ? "Your top-up is complete" : "Your plan is active",
        body: payment.kind === "topup" ? "Razorpay confirmed your payment and the purchased credits are in your wallet." : "Razorpay confirmed your payment and your subscription is active.",
        href: "/dashboard/wallet",
      });
    }
    return { alreadyPaid: false, paymentId: payment.id };
  });
}

async function grantPaidCredits(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  walletId: string,
  userId: string,
  credits: number,
  bucketType: "purchased" | "subscription",
  transactionType: "purchase" | "subscription_grant",
  paymentId: string,
  expiresAt?: Date,
  sourceRef?: string,
) {
  if (!Number.isSafeInteger(credits) || credits <= 0) throw new RazorpayError("This payment grant is invalid.");
  const source = sourceRef ?? paymentId;
  const [existing] = await tx.select({ id: walletBuckets.id }).from(walletBuckets)
    .where(and(eq(walletBuckets.walletId, walletId), eq(walletBuckets.type, bucketType), eq(walletBuckets.sourceRef, source))).limit(1);
  if (existing) return;
  await tx.insert(walletBuckets).values({ walletId, type: bucketType, credits, expiresAt: expiresAt ?? null, sourceRef: source });
  const [ledger] = await tx.select({ balance: sql<string>`coalesce(sum(${walletTransactions.amount}), 0)` }).from(walletTransactions).where(eq(walletTransactions.walletId, walletId));
  const balanceAfter = Number(ledger.balance) + credits;
  await tx.insert(walletTransactions).values({
    walletId, userId, type: transactionType, amount: credits, balanceAfter, bucketType,
    reference: `payment:${paymentId}`, metadata: { paymentId, sourceRef: source },
  });
}
