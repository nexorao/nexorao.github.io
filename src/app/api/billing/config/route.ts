import { razorpayConfigured } from "@/lib/payments/razorpay";
import { AuthError, requireUser } from "@/lib/auth/session";
import { currencyForCountry, currencyLocale, getCountryFromHeaders, getInrExchangeRate } from "@/lib/currency";

function setting(key: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[key] ?? fallback);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

export async function GET(request: Request) {
  try { await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to continue." : "Authentication required." }, { status: 401 });
  }
  const country = getCountryFromHeaders(request.headers);
  const currency = currencyForCountry(country);
  let exchange = { rate: 1, asOf: "fallback" };
  try { exchange = await getInrExchangeRate(currency); } catch { /* display can fall back to INR */ }
  return Response.json({
    usdInrRate: setting("USD_INR_RATE", 89, 1, 1_000),
    minTopupInr: Math.floor(setting("MIN_TOPUP_INR", 500, 1, 100_000)),
    maxTopupInr: Math.floor(setting("MAX_TOPUP_INR", 100_000, 500, 1_000_000)),
    orderExpiryMinutes: Math.floor(setting("ORDER_EXPIRY_MINUTES", 15, 1, 120)),
    razorpayReady: razorpayConfigured(),
    country,
    currency,
    locale: currencyLocale(country, currency),
    exchangeRate: exchange.rate,
    exchangeRateDate: exchange.asOf,
    devSimulationAvailable: process.env.NODE_ENV !== "production",
    usdtReady: false,
  }, { headers: { "cache-control": "no-store" } });
}
