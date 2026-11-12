import "server-only";

export const CURRENCIES = [
  "INR", "USD", "GBP", "EUR", "CAD", "AUD", "NZD", "SGD", "AED",
  "SAR", "CHF", "HKD", "JPY", "CNY", "BRL", "MXN", "ZAR", "TRY",
  "KRW", "THB", "MYR", "IDR", "PHP", "PKR", "BDT", "LKR", "NGN",
  "KES", "ARS", "CLP", "COP", "PLN", "SEK", "NOK", "DKK", "CZK", "KWD", "BHD", "OMR",
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

const COUNTRY_CURRENCY: Record<string, CurrencyCode> = {
  IN: "INR", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD",
  SG: "SGD", AE: "AED", SA: "SAR", CH: "CHF", HK: "HKD", JP: "JPY",
  CN: "CNY", BR: "BRL", MX: "MXN", ZA: "ZAR", TR: "TRY", KR: "KRW",
  TH: "THB", MY: "MYR", ID: "IDR", PH: "PHP", PK: "PKR", BD: "BDT",
  LK: "LKR", NG: "NGN", KE: "KES", AR: "ARS", CL: "CLP", CO: "COP",
  PL: "PLN", SE: "SEK", NO: "NOK", DK: "DKK", CZ: "CZK", KW: "KWD", BH: "BHD", OM: "OMR",
  AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR",
  FI: "EUR", FR: "EUR", GR: "EUR", HR: "EUR", IE: "EUR", IT: "EUR",
  LT: "EUR", LU: "EUR", LV: "EUR", MT: "EUR", NL: "EUR", PT: "EUR",
  SI: "EUR", SK: "EUR", BG: "EUR", RO: "EUR", IS: "EUR", LI: "CHF",
};

const currencyCache = new Map<CurrencyCode, { rate: number; fetchedAt: number; asOf: string }>();
const RATE_TTL_MS = 6 * 60 * 60 * 1000;

export function getCountryFromHeaders(headers: Headers): string {
  const edgeCountry = headers.get("x-vercel-ip-country")
    ?? headers.get("cf-ipcountry")
    ?? headers.get("x-country-code");
  if (edgeCountry && /^[a-z]{2}$/i.test(edgeCountry)) return edgeCountry.toUpperCase();

  const timezone = headers.get("x-user-timezone") ?? "";
  const timezoneCountries: Record<string, string> = {
    "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Europe/London": "GB",
    "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Pacific/Auckland": "NZ",
    "America/Toronto": "CA", "America/Vancouver": "CA", "America/Montreal": "CA",
    "Asia/Singapore": "SG", "Asia/Dubai": "AE", "Asia/Tokyo": "JP",
    "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "Europe/Zurich": "CH",
  };
  if (timezoneCountries[timezone]) return timezoneCountries[timezone];

  const acceptLanguage = headers.get("accept-language") ?? headers.get("x-user-locale") ?? "";
  for (const candidate of acceptLanguage.split(",")) {
    const tag = candidate.split(";")[0]?.trim() ?? "";
    const region = tag.match(/[-_]([a-z]{2})(?:$|[-_])/i)?.[1];
    if (region) return region.toUpperCase();
  }
  return "US";
}

export function currencyForCountry(country: string): CurrencyCode {
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? "USD";
}

export function currencyMinorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export async function getInrExchangeRate(currency: CurrencyCode): Promise<{ rate: number; asOf: string }> {
  if (currency === "INR") return { rate: 1, asOf: new Date().toISOString().slice(0, 10) };
  const cached = currencyCache.get(currency);
  if (cached && Date.now() - cached.fetchedAt < RATE_TTL_MS) {
    return { rate: cached.rate, asOf: cached.asOf };
  }

  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/INR/${currency}`, {
      cache: "force-cache",
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`FX rate request failed (${response.status}).`);
    const result = await response.json() as { rate?: number; date?: string };
    if (!Number.isFinite(result.rate) || !result.rate || result.rate <= 0) throw new Error("FX rate is unavailable.");
    const asOf = result.date ?? new Date().toISOString().slice(0, 10);
    currencyCache.set(currency, { rate: result.rate, fetchedAt: Date.now(), asOf });
    return { rate: result.rate, asOf };
  } catch (error) {
    const usdInr = Number(process.env.USD_INR_RATE ?? process.env.NEXT_PUBLIC_FX_INR_PER_USD);
    if (currency === "USD" && Number.isFinite(usdInr) && usdInr > 0) {
      return { rate: 1 / usdInr, asOf: "fallback" };
    }
    throw error;
  }
}

export function toCurrencyMinor(inrAmount: number, currency: CurrencyCode, inrToCurrencyRate: number): number {
  const multiplier = 10 ** currencyMinorDigits(currency);
  let amount = Math.round(inrAmount * inrToCurrencyRate * multiplier);
  // Razorpay requires the third decimal place to be zero for three-decimal currencies.
  if (currencyMinorDigits(currency) === 3) amount = Math.round(amount / 10) * 10;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Converted payment amount is invalid.");
  return amount;
}

export function allowedRazorpayCurrency(currency: CurrencyCode): boolean {
  if (currency === "INR") return true;
  // International currencies are enabled by default. Set this to `false` to
  // intentionally restrict the merchant to INR; Razorpay account settings
  // still decide which methods are available to a real payment.
  if (process.env.RAZORPAY_INTERNATIONAL_ENABLED === "false") return false;
  const configured = process.env.RAZORPAY_INTERNATIONAL_CURRENCIES
    ?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  const supportedByDefault: CurrencyCode[] = [...CURRENCIES];
  return (configured?.length ? configured : supportedByDefault).includes(currency);
}

export function currencyLocale(country: string, currency: string): string {
  const language = currency === "INR" ? "en-IN"
    : currency === "GBP" ? "en-GB"
      : currency === "EUR" ? "en-IE"
        : currency === "JPY" || currency === "CNY" || currency === "KRW" ? "en-US"
          : `en-${country.toUpperCase()}`;
  try { new Intl.NumberFormat(language, { style: "currency", currency }); return language; }
  catch { return "en-US"; }
}
