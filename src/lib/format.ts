/**
 * Formatting helpers. Money is handled in integer paise everywhere in the
 * product (master spec §5); these helpers only format for display.
 */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const numberEnIn = new Intl.NumberFormat("en-IN");

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatInr(rupees: number): string {
  return inr.format(rupees);
}

export function formatInrPrecise(rupees: number): string {
  return inrPrecise.format(rupees);
}

export function formatCredits(credits: number): string {
  return numberEnIn.format(credits);
}

export function formatUsd(value: number): string {
  return usd.format(value);
}

/** 1200 -> "1,200", 128000 -> "128K", 1050000 -> "1.05M" */
export function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined) return "TBD";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${trimZero(m)}M`;
  }
  if (tokens >= 1_000) {
    return `${trimZero(tokens / 1_000)}K`;
  }
  return numberEnIn.format(tokens);
}

function trimZero(n: number): string {
  const fixed = n.toFixed(2);
  return fixed.endsWith("00")
    ? String(Math.round(n))
    : fixed.endsWith("0")
      ? n.toFixed(1)
      : fixed;
}

/** ISO date (yyyy-mm-dd) -> "11 Nov 2026" */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
