/**
 * SAMPLE MODEL REGISTRY — Phase 1 UI seed data.
 *
 * Master spec §1: models must come from a dynamic, admin-managed database
 * registry in production. This file only feeds the public explorer preview.
 *
 * Entries marked `lastVerified` were checked against the linked official
 * provider documentation on that date (2026-11-11). Entries with
 * `lastVerified: null` are NOT verified — pricing/scope can vary by host and
 * must be confirmed against provider docs by an admin before launch.
 */

export type ProviderCategory = "claude" | "gpt" | "gemini" | "open-source";

export type PlanTier = "free" | "plus" | "pro" | "ultra" | "max";

export type ModelStatus = "available" | "preview" | "deprecated";

export type VerificationStatus = "verified" | "unverified";

export interface ModelPricing {
  /** USD per 1M input tokens (provider list price). */
  inputUsdPerMTok: number;
  /** USD per 1M output tokens (provider list price). */
  outputUsdPerMTok: number;
}

export interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
  reasoning: boolean;
}

export interface ModelEntry {
  id: string;
  name: string;
  /** Display name of the upstream provider. */
  provider: string;
  category: ProviderCategory;
  status: ModelStatus;
  capabilities: ModelCapabilities;
  /** Context window in tokens. null = must be verified by admin. */
  contextWindow: number | null;
  /** Max output tokens. null = must be verified by admin. */
  maxOutput: number | null;
  /** Provider list price. null = host-dependent / unverified. */
  pricing: ModelPricing | null;
  /**
   * PROPOSED platform markup on provider cost — admin-configurable per
   * model (master spec §6). Not a provider price.
   */
  markupPct: number;
  /** Minimum plan tier allowed to use this model (product decision). */
  minPlan: PlanTier;
  /** Date the entry was checked against provider docs, or null. */
  lastVerified: string | null;
  sourceUrl: string | null;
  notes?: string;
  /** Database availability flag; absent for the static marketing preview. */
  active?: boolean;
}

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
  "open-source": "Open-source",
};

export const CATEGORY_ORDER: ProviderCategory[] = [
  "claude",
  "gpt",
  "gemini",
  "open-source",
];

export const PLAN_ORDER: PlanTier[] = ["free", "plus", "pro", "ultra", "max"];

export const MODELS: ModelEntry[] = [
  // ------------------------------------------------------------------
  // Anthropic — verified 2026-11-11 against platform.claude.com docs
  // ------------------------------------------------------------------
  {
    id: "claude-fable-5-2",
    name: "Claude Fable 5.2",
    provider: "Anthropic",
    category: "claude",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { inputUsdPerMTok: 8, outputUsdPerMTok: 40 },
    markupPct: 15,
    minPlan: "max",
    lastVerified: "2026-11-11",
    sourceUrl: "https://platform.claude.com/docs/en/models/overview",
    notes: "Demanding reasoning and long-horizon agentic work.",
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    provider: "Anthropic",
    category: "claude",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
    markupPct: 15,
    minPlan: "pro",
    lastVerified: "2026-11-11",
    sourceUrl: "https://platform.claude.com/docs/en/models/overview",
    notes: "Long-running agentic coding and knowledge work.",
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    provider: "Anthropic",
    category: "claude",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    markupPct: 15,
    minPlan: "plus",
    lastVerified: "2026-11-11",
    sourceUrl: "https://platform.claude.com/docs/en/models/overview",
    notes: "Best combination of speed and intelligence.",
  },
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    provider: "Anthropic",
    category: "claude",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 },
    markupPct: 15,
    minPlan: "free",
    lastVerified: "2026-11-11",
    sourceUrl: "https://platform.claude.com/docs/en/models/overview",
    notes: "From-pricing: list rates start at $0.10/$0.50 per MTok.",
  },

  // ------------------------------------------------------------------
  // OpenAI — verified 2026-11-11 against developers.openai.com docs
  // ------------------------------------------------------------------
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    provider: "OpenAI",
    category: "gpt",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    pricing: { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
    markupPct: 15,
    minPlan: "ultra",
    lastVerified: "2026-11-11",
    sourceUrl: "https://developers.openai.com/api/docs/models",
    notes: "Flagship model for the most demanding work.",
  },
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    provider: "OpenAI",
    category: "gpt",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    markupPct: 15,
    minPlan: "pro",
    lastVerified: "2026-11-11",
    sourceUrl: "https://developers.openai.com/api/docs/models",
    notes: "Near-Astra performance at a lower cost.",
  },
  {
    id: "gpt-6.1-terra",
    name: "GPT-6.1 Terra",
    provider: "OpenAI",
    category: "gpt",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    pricing: { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
    markupPct: 15,
    minPlan: "plus",
    lastVerified: "2026-11-11",
    sourceUrl: "https://developers.openai.com/api/docs/models",
    notes: "Fast visual reasoning and natural writing.",
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    provider: "OpenAI",
    category: "gpt",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    pricing: { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 },
    markupPct: 15,
    minPlan: "free",
    lastVerified: "2026-11-11",
    sourceUrl: "https://developers.openai.com/api/docs/models",
    notes: "Most efficient model for high-volume tasks.",
  },

  // ------------------------------------------------------------------
  // Google Gemini — verified 2026-11-11 against ai.google.dev docs
  // ------------------------------------------------------------------
  {
    id: "gemini-4-carbon",
    name: "Gemini 4 Carbon",
    provider: "Google",
    category: "gemini",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000,
    maxOutput: 65_000,
    pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    markupPct: 15,
    minPlan: "ultra",
    lastVerified: "2026-11-11",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    notes:
      "Scheduled price change: $4/$20 per MTok starting 2026-12-01 per Google docs.",
  },
  {
    id: "gemini-4-argon",
    name: "Gemini 4 Argon",
    provider: "Google",
    category: "gemini",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000,
    maxOutput: 65_000,
    pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    markupPct: 15,
    minPlan: "pro",
    lastVerified: "2026-11-11",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    notes:
      "Scheduled price change: $4/$20 per MTok starting 2026-12-01 per Google docs.",
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "Google",
    category: "gemini",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: null,
    maxOutput: null,
    pricing: { inputUsdPerMTok: 0.75, outputUsdPerMTok: 3.75 },
    markupPct: 15,
    minPlan: "plus",
    lastVerified: "2026-11-11",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    notes:
      "Pricing $0.75/$3.75 through 2026-12-31, then $1.50/$7.50. Context window to be verified by admin.",
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    provider: "Google",
    category: "gemini",
    status: "available",
    capabilities: { vision: true, tools: true, reasoning: false },
    contextWindow: null,
    maxOutput: null,
    pricing: { inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5 },
    markupPct: 15,
    minPlan: "free",
    lastVerified: "2026-11-11",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    notes: "High-volume, cost-efficient tasks. Context window to be verified by admin.",
  },

  // ------------------------------------------------------------------
  // Open-source models via authorized hosts — NOT yet verified.
  // Pricing varies by host; admin must confirm IDs and rates.
  // ------------------------------------------------------------------
  {
    id: "kimi-k3.1-pro",
    name: "Kimi K3.1 Pro",
    provider: "Moonshot AI",
    category: "open-source",
    status: "available",
    capabilities: { vision: false, tools: true, reasoning: true },
    contextWindow: null,
    maxOutput: null,
    pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    markupPct: 15,
    minPlan: "pro",
    lastVerified: null,
    sourceUrl: null,
    notes:
      "Reported $2/$10 per MTok on the Moonshot API (secondary sources only). Verify model ID, context and pricing against Moonshot docs before launch.",
  },
  {
    id: "glm-5.2",
    name: "GLM 5.2",
    provider: "Zhipu AI",
    category: "open-source",
    status: "available",
    capabilities: { vision: false, tools: true, reasoning: true },
    contextWindow: null,
    maxOutput: null,
    pricing: null,
    markupPct: 15,
    minPlan: "pro",
    lastVerified: null,
    sourceUrl: null,
    notes:
      "Open-weight model, host-dependent pricing (Zhipu, OpenRouter, Fireworks). Admin to verify ID and rates.",
  },
  {
    id: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    provider: "DeepSeek",
    category: "open-source",
    status: "available",
    capabilities: { vision: false, tools: true, reasoning: true },
    contextWindow: null,
    maxOutput: null,
    pricing: null,
    markupPct: 15,
    minPlan: "pro",
    lastVerified: null,
    sourceUrl: null,
    notes:
      "Open-weight model, host-dependent pricing. Admin to verify ID and rates.",
  },
];

export function verificationStatus(model: ModelEntry): VerificationStatus {
  return model.lastVerified ? "verified" : "unverified";
}

export function getModel(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id);
}
