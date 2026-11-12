/**
 * Credit pricing engine (client-side mirror of master spec §6).
 *
 *   provider_cost = input_tokens * in_price + output_tokens * out_price
 *   billed        = provider_cost * (1 + markup_pct)  (+ minimum charge)
 *   credits       = ceil(billed / credit_value_in_paise)
 *
 * In production the authoritative calculation always happens server-side
 * (never trust browser-computed costs — spec §6). These helpers exist for
 * the public pricing calculator and model-card estimates only, using the
 * same constants the billing service will use.
 */

import type { ModelEntry } from "@/data/models";

/** 1 credit = 1 paise = ₹0.01. Admin-configurable (settings table in Phase 2). */
export const CREDIT_VALUE_PAISE = 1;

/**
 * ASSUMPTION — not a fact. USD→INR conversion used for display estimates
 * only. Override with NEXT_PUBLIC_FX_INR_PER_USD; the admin panel will own
 * the real value in Phase 2. Update it whenever launch approaches.
 */
export const FALLBACK_FX_INR_PER_USD = 90;

export function fxInrPerUsd(): number {
  const raw = process.env.NEXT_PUBLIC_FX_INR_PER_USD;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_FX_INR_PER_USD;
}

export interface CostEstimate {
  /** Raw provider list price for the token counts, in USD. */
  providerCostUsd: number;
  /** Provider cost converted to INR at the configured FX rate. */
  providerCostInr: number;
  /** Provider cost including the platform markup, in INR. */
  billedInr: number;
  /** Credits actually charged (integer, never fractional, minimum 1). */
  credits: number;
}

export function estimateCredits(
  model: ModelEntry,
  inputTokens: number,
  outputTokens: number,
  fx: number = fxInrPerUsd(),
): CostEstimate {
  const pricing = model.pricing;
  if (!pricing) {
    return { providerCostUsd: 0, providerCostInr: 0, billedInr: 0, credits: 0 };
  }

  const providerCostUsd =
    (inputTokens / 1_000_000) * pricing.inputUsdPerMTok +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMTok;

  const providerCostInr = providerCostUsd * fx;
  const billedInr = providerCostInr * (1 + model.markupPct / 100);
  const billedPaise = billedInr * 100;
  const credits = Math.max(1, Math.ceil(billedPaise / CREDIT_VALUE_PAISE));

  return { providerCostUsd, providerCostInr, billedInr, credits };
}

/** Per-million-token credit cost in one direction, for model cards. */
export function creditsPerMTok(
  model: ModelEntry,
  direction: "input" | "output",
  fx: number = fxInrPerUsd(),
): number | null {
  const pricing = model.pricing;
  if (!pricing) return null;
  const usdPerMTok =
    direction === "input" ? pricing.inputUsdPerMTok : pricing.outputUsdPerMTok;
  const billedInr = usdPerMTok * fx * (1 + model.markupPct / 100);
  return Math.ceil(billedInr * 100 / CREDIT_VALUE_PAISE);
}
