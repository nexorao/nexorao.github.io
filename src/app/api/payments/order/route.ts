import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, plans, topupPacks } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";
import { RazorpayError, razorpayConfigured, razorpayRequest } from "@/lib/payments/razorpay";
import { PayloadTooLargeError, readRequestTextLimited } from "@/lib/http";
import { allowedRazorpayCurrency, currencyForCountry, currencyLocale, getCountryFromHeaders, getInrExchangeRate, toCurrencyMinor } from "@/lib/currency";

const inputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("topup"), packId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("subscription"), planId: z.string().min(1).max(64), billingCycle: z.enum(["monthly", "annual"]) }),
]);

export async function POST(request: Request) {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to continue." : "Authentication required." }, { status: 401 });
  }
  const provider = razorpayConfigured() ? "razorpay" : process.env.NODE_ENV === "production" ? null : "mock";
  if (!provider) return Response.json({ error: "Razorpay checkout needs the merchant key ID and secret to be configured." }, { status: 503 });
  let raw: unknown;
  try { raw = JSON.parse(await readRequestTextLimited(request, 4_000)); }
  catch (error) { return Response.json({ error: error instanceof PayloadTooLargeError ? error.message : "Invalid request." }, { status: error instanceof PayloadTooLargeError ? 413 : 400 }); }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Choose a valid plan or top-up pack." }, { status: 400 });

  let kind: "subscription" | "topup";
  let baseAmountPaise: number;
  let metadata: Record<string, unknown>;
  let description: string;
  if (parsed.data.kind === "topup") {
    const [selected] = await db.select().from(topupPacks).where(eq(topupPacks.id, parsed.data.packId)).limit(1);
    if (!selected || !selected.active || selected.pricePaise <= 0) return Response.json({ error: "This top-up pack is unavailable." }, { status: 404 });
    kind = "topup";
    baseAmountPaise = selected.pricePaise;
    metadata = { packId: selected.id };
    description = `NEXORAO ${selected.name} credit top-up`;
  } else {
    const [plan] = await db.select().from(plans).where(and(eq(plans.id, parsed.data.planId), eq(plans.active, true))).limit(1);
    if (!plan || plan.pricePaiseMonthly <= 0) return Response.json({ error: "This paid plan is unavailable." }, { status: 404 });
    kind = "subscription";
    baseAmountPaise = plan.pricePaiseMonthly * (parsed.data.billingCycle === "annual" ? plan.annualMonthsCharged : 1);
    metadata = { planId: plan.id, billingCycle: parsed.data.billingCycle };
    description = `NEXORAO ${plan.name} ${parsed.data.billingCycle} plan`;
  }
  if (!Number.isSafeInteger(baseAmountPaise) || baseAmountPaise < 100) return Response.json({ error: "This amount is below the payment gateway minimum." }, { status: 400 });

  const country = getCountryFromHeaders(request.headers);
  const currency = currencyForCountry(country);
  if (provider === "razorpay" && !allowedRazorpayCurrency(currency)) {
    return Response.json({ error: `Razorpay international payments are not enabled for ${currency}. Please contact support or use an enabled billing region.` }, { status: 503 });
  }
  let exchange: { rate: number; asOf: string };
  try { exchange = await getInrExchangeRate(currency); }
  catch { return Response.json({ error: "The local currency rate is temporarily unavailable. Please retry in a moment." }, { status: 503 }); }
  let amountMinor: number;
  try { amountMinor = toCurrencyMinor(baseAmountPaise / 100, currency, exchange.rate); }
  catch { return Response.json({ error: "The converted payment amount is invalid." }, { status: 400 }); }
  metadata = { ...metadata, baseAmountPaise, exchangeRate: exchange.rate, exchangeRateDate: exchange.asOf, country, currency };

  const [payment] = await db.insert(payments).values({
    userId: user.id, kind, provider, status: "created", amountPaise: amountMinor, currency, metadata,
  }).returning({ id: payments.id });
  if (provider === "mock") {
    const orderId = `DEV_${payment.id.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    await db.update(payments).set({ reference: orderId, metadata: { ...metadata, description }, updatedAt: new Date() }).where(eq(payments.id, payment.id));
    return Response.json({ provider, paymentId: payment.id, keyId: "", orderId, amount: amountMinor, currency, locale: currencyLocale(country, currency), exchangeRate: exchange.rate, exchangeRateDate: exchange.asOf, name: "NEXORAO", description, prefill: { name: user.name, email: user.email } }, { headers: { "cache-control": "no-store" } });
  }
  try {
    const order = await razorpayRequest<{ id: string; amount: number; currency: string }>("/orders", "POST", {
      amount: amountMinor,
      currency,
      receipt: payment.id,
      notes: { nexora_payment_id: payment.id, nexora_user_id: user.id },
    });
    if (order.amount !== amountMinor || order.currency !== currency) throw new Error("Razorpay order amount mismatch.");
    await db.update(payments).set({ reference: order.id, metadata: { ...metadata, description }, updatedAt: new Date() }).where(eq(payments.id, payment.id));
    return Response.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      paymentId: payment.id,
      amount: order.amount,
      currency: order.currency,
      locale: currencyLocale(country, currency),
      exchangeRate: exchange.rate,
      exchangeRateDate: exchange.asOf,
      name: "NEXORAO",
      description,
      prefill: { name: user.name, email: user.email },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    await db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, payment.id));
    const message = error instanceof RazorpayError ? error.message : "Could not create a payment order.";
    console.error("[payments] order creation failed", error);
    return Response.json({ error: message }, { status: error instanceof RazorpayError ? error.status : 502 });
  }
}
