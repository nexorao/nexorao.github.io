import { currencyForCountry, currencyLocale, getCountryFromHeaders, getInrExchangeRate } from "@/lib/currency";

export async function GET(request: Request) {
  const country = getCountryFromHeaders(request.headers);
  const currency = currencyForCountry(country);
  try {
    const exchange = await getInrExchangeRate(currency);
    return Response.json({ country, currency, locale: currencyLocale(country, currency), rate: exchange.rate, asOf: exchange.asOf }, {
      headers: { "cache-control": "private, max-age=3600" },
    });
  } catch {
    return Response.json({ country: "IN", currency: "INR", locale: "en-IN", rate: 1, asOf: null }, {
      headers: { "cache-control": "private, max-age=900" },
    });
  }
}
