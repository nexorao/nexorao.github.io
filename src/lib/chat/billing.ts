import type { PlatformSettings } from "@/lib/settings-defaults";

export interface ChatPrice {
  inputUsdMicroPerMTok: number;
  outputUsdMicroPerMTok: number;
  cachedUsdMicroPerMTok: number | null;
  reasoningUsdMicroPerMTok: number | null;
  markupPct: number;
}

/**
 * Converts upstream usage into integer credits with integer arithmetic.
 * Provider rates are micro-USD per million tokens; credits are whole units.
 */
export function chargeForUsage(
  price: ChatPrice,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    reasoningOutputTokens: number;
  },
  settings: PlatformSettings,
): number {
  const input = BigInt(Math.max(0, Math.trunc(usage.inputTokens)));
  const output = BigInt(Math.max(0, Math.trunc(usage.outputTokens)));
  const cached = input < BigInt(Math.max(0, Math.trunc(usage.cachedInputTokens)))
    ? input
    : BigInt(Math.max(0, Math.trunc(usage.cachedInputTokens)));
  const reasoning = output < BigInt(Math.max(0, Math.trunc(usage.reasoningOutputTokens)))
    ? output
    : BigInt(Math.max(0, Math.trunc(usage.reasoningOutputTokens)));
  const normalInput = input - cached;
  const normalOutput = output - reasoning;
  const weightedRateTokens =
    normalInput * BigInt(price.inputUsdMicroPerMTok) +
    cached * BigInt(price.cachedUsdMicroPerMTok ?? price.inputUsdMicroPerMTok) +
    normalOutput * BigInt(price.outputUsdMicroPerMTok) +
    reasoning * BigInt(price.reasoningUsdMicroPerMTok ?? price.outputUsdMicroPerMTok);

  const fxScaled = BigInt(Math.ceil(settings.fxInrPerUsd * 1_000_000));
  const markupFactor = BigInt(100 + price.markupPct);
  const hundred = BigInt(100);
  const denominator = BigInt("1000000000000000000");
  const numerator = weightedRateTokens * fxScaled * hundred * markupFactor;
  const billedPaise = (numerator + denominator * hundred - BigInt(1)) / (denominator * hundred);
  const creditValue = BigInt(Math.max(1, Math.trunc(settings.creditValuePaise)));
  const credits = (billedPaise + creditValue - BigInt(1)) / creditValue;
  return Math.max(settings.minChargeCredits, Number(credits));
}

export function approximateTokens(text: string): number {
  if (!text) return 0;
  // One token per Unicode code point is intentionally conservative for holds.
  return Array.from(text).length;
}
