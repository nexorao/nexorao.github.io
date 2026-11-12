import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";
import { rateLimitAsync } from "@/lib/rate-limit";
import { razorpayConfigured, razorpayRequest, RazorpayError } from "@/lib/payments/razorpay";
import { PayloadTooLargeError, readRequestTextLimited } from "@/lib/http";
import { allowedRazorpayCurrency, currencyForCountry, currencyLocale, getCountryFromHeaders, getInrExchangeRate, toCurrencyMinor } from "@/lib/currency";

const inputSchema = z.object({
  method: z.literal("upi"),
  amountInr: z.number().int().positive().max(100_000),
  couponCode: z.string().trim().max(40).optional(),
});

function numberSetting(key: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[key] ?? fallback);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

export async function POST(request: Request) {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to continue." : "Authentication required." }, { status: 401 });
  }
  const limit = await rateLimitAsync(`billing-order:${user.id}`, 5, 60_000);
  if (!limit.allowed) return Response.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });

  let raw: unknown;
  try { raw = JSON.parse(await readRequestTextLimited(request, 4_000)); }
  catch (error) { return Response.json({ error: error instanceof PayloadTooLargeError ? error.message : "Invalid request." }, { status: error instanceof PayloadTooLargeError ? 413 : 400 }); }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Choose a valid payment method and amount." }, { status: 400 });
  const { method, amountInr, couponCode } = parsed.data;
  const minimum = Math.floor(numberSetting("MIN_TOPUP_INR", 500, 1, 100_000));
  const maximum = Math.floor(numberSetting("MAX_TOPUP_INR", 100_000, minimum, 1_000_000));
  const expiryMinutes = Math.floor(numberSetting("ORDER_EXPIRY_MINUTES", 15, 1, 120));
  const usdInrRate = numberSetting("USD_INR_RATE", 89, 1, 1_000);
  if (amountInr < minimum || amountInr > maximum) {
    return Response.json({ error: `Top-ups must be between ₹${minimum.toLocaleString("en-IN")} and ₹${maximum.toLocaleString("en-IN")}.` }, { status: 400 });
  }
  if (couponCode) return Response.json({ error: "This coupon code is not active." }, { status: 400 });
  const provider = razorpayConfigured() ? "razorpay" : process.env.NODE_ENV === "production" ? null : "mock";
  if (!provider) return Response.json({ error: "UPI checkout is not configured. Connect Razorpay before accepting payments." }, { status: 503 });

  const country = getCountryFromHeaders(request.headers);
  const currency = currencyForCountry(country);
  if (provider === "razorpay" && !allowedRazorpayCurrency(currency)) {
    return Response.json({ error: `Razorpay international payments are not enabled for ${currency}.` }, { status: 503 });
  }
  let exchange: { rate: number; asOf: string };
  try { exchange = await getInrExchangeRate(currency); }
  catch { return Response.json({ error: "The local currency rate is temporarily unavailable. Please retry shortly." }, { status: 503 }); }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiryMinutes * 60_000);
  const amountPaiseBase = amountInr * 100;
  let amountMinor: number;
  try { amountMinor = currency === "INR" ? amountPaiseBase : toCurrencyMinor(amountInr, currency, exchange.rate); }
  catch { return Response.json({ error: "The converted payment amount is invalid." }, { status: 400 }); }
  const creditUsd = Number((amountInr / usdInrRate).toFixed(2));
  const creditedCredits = amountPaiseBase;
  let created: { id: string; amountPaise: number; displayReference: string };
  try {
    created = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`wallet-topup:${currency}:${amountInr}`}))`);
      await tx.update(payments).set({ status: "failed", updatedAt: now }).where(and(
        eq(payments.provider, provider), eq(payments.kind, "topup"), eq(payments.status, "created"),
        sql`${payments.createdAt} < ${new Date(now.getTime() - expiryMinutes * 60_000)}`,
        sql`${payments.metadata}->>'customTopup' = 'true'`,
      ));
      const pending = currency === "INR" ? await tx.select({ amountPaise: payments.amountPaise }).from(payments).where(and(
        eq(payments.provider, provider), eq(payments.kind, "topup"), eq(payments.status, "created"),
        gt(payments.createdAt, new Date(now.getTime() - expiryMinutes * 60_000)),
        eq(payments.currency, currency),
        sql`${payments.metadata}->>'baseInr' = ${String(amountInr)}`,
      )) : [];
      let suffix = 0;
      if (currency === "INR") {
        const used = new Set(pending.map((row) => row.amountPaise % 100));
        const start = randomInt(1, 100);
        for (let offset = 0; offset < 99; offset += 1) {
          const candidate = ((start - 1 + offset) % 99) + 1;
          if (!used.has(candidate)) { suffix = candidate; break; }
        }
        if (!suffix) throw new Error("All unique payment amounts are busy. Try again in a minute.");
      }
      const id = randomBytes(4).toString("hex").toUpperCase();
      const displayReference = `UPI_${id}_${Math.floor(now.getTime() / 1000)}`;
      const metadata = {
        customTopup: true, baseInr: amountInr, baseAmountPaise: amountPaiseBase,
        creditUsd, creditedCredits, displayReference, paymentMethod: method,
        expiresAt: expiresAt.toISOString(), usdInrRate, exchangeRate: exchange.rate,
        exchangeRateDate: exchange.asOf, country, currency,
      };
      const [payment] = await tx.insert(payments).values({
        userId: user.id, kind: "topup", provider, status: "created", amountPaise: amountMinor + suffix,
        currency, metadata,
      }).returning({ id: payments.id, amountPaise: payments.amountPaise });
      return { ...payment, displayReference };
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not reserve a payment amount." }, { status: 409 });
  }

  if (provider === "mock") {
    const orderId = `DEV_${created.id.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    await db.update(payments).set({ reference: orderId, updatedAt: new Date() }).where(eq(payments.id, created.id));
    return Response.json({ provider, paymentId: created.id, orderId, amount: created.amountPaise, currency, locale: currencyLocale(country, currency), exchangeRate: exchange.rate, reference: created.displayReference, baseInr: amountInr, creditUsd, expiresAt: expiresAt.toISOString(), name: "NEXORAO", description: "Development payment simulation", prefill: { name: user.name, email: user.email } }, { headers: { "cache-control": "no-store" } });
  }

  try {
    const closeBy = Math.floor(expiresAt.getTime() / 1000);
    let qr: { id: string; image_url?: string; payment_amount?: number } | null = null;
    try {
      if (currency !== "INR") throw new RazorpayError("UPI QR is available for INR checkout.", 400);
      qr = await razorpayRequest<{ id: string; image_url?: string; payment_amount?: number }>("/payments/qr_codes", "POST", {
        type: "upi_qr", name: "NexoraO wallet top-up", usage: "single_use", fixed_amount: true,
        payment_amount: created.amountPaise, description: `Nexora balance · ${created.displayReference}`,
        close_by: closeBy, notes: { payment_id: created.id, user_id: user.id, reference: created.displayReference },
      });
      if (!qr.id || !qr.image_url || (qr.payment_amount !== undefined && qr.payment_amount !== created.amountPaise)) qr = null;
    } catch (error) {
      if (!(error instanceof RazorpayError) || ![400, 403, 404].includes(error.status)) throw error;
      // Some merchant accounts require QR collection to be enabled. Use the
      // standard hosted checkout as a safe fallback for those accounts.
      console.info("[billing] dynamic QR unavailable; using hosted Razorpay checkout", error.message);
    }
    if (qr) {
      const metadata = { customTopup: true, baseInr: amountInr, baseAmountPaise: amountPaiseBase, creditUsd, creditedCredits, displayReference: created.displayReference, paymentMethod: method, expiresAt: expiresAt.toISOString(), usdInrRate, exchangeRate: exchange.rate, exchangeRateDate: exchange.asOf, country, currency, qrImageUrl: qr.image_url };
      await db.update(payments).set({ reference: qr.id, metadata, updatedAt: new Date() }).where(eq(payments.id, created.id));
      return Response.json({ provider, checkoutMode: "qr", paymentId: created.id, orderId: qr.id, qrImageUrl: qr.image_url, amount: created.amountPaise, currency, locale: currencyLocale(country, currency), exchangeRate: exchange.rate, reference: created.displayReference, baseInr: amountInr, creditUsd, expiresAt: expiresAt.toISOString(), name: "NEXORAO", description: `NEXORAO balance top-up · ${created.displayReference}`, prefill: { name: user.name, email: user.email } }, { headers: { "cache-control": "no-store" } });
    }
    const gatewayOrder = await razorpayRequest<{ id: string; amount: number; currency: string }>("/orders", "POST", {
      amount: created.amountPaise, currency, receipt: created.id,
      notes: { nexora_payment_id: created.id, nexora_user_id: user.id, reference: created.displayReference },
    });
    if (gatewayOrder.amount !== created.amountPaise || gatewayOrder.currency !== currency) throw new Error("Gateway order amount mismatch.");
    await db.update(payments).set({ reference: gatewayOrder.id, updatedAt: new Date() }).where(eq(payments.id, created.id));
    return Response.json({ provider, paymentId: created.id, orderId: gatewayOrder.id, keyId: process.env.RAZORPAY_KEY_ID, amount: gatewayOrder.amount, currency: gatewayOrder.currency, locale: currencyLocale(country, currency), exchangeRate: exchange.rate, reference: created.displayReference, baseInr: amountInr, creditUsd, expiresAt: expiresAt.toISOString(), name: "NEXORAO", description: `NEXORAO balance top-up · ${created.displayReference}`, prefill: { name: user.name, email: user.email } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    await db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, created.id));
    const message = error instanceof RazorpayError ? error.message : "Could not create a payment order.";
    return Response.json({ error: message }, { status: error instanceof RazorpayError ? error.status : 502 });
  }
}
