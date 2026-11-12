import type { PlanTier } from "@/data/models";

/**
 * PROPOSED LAUNCH PRICING (master spec §7). Every value here is a product
 * proposal the admin can edit from the platform settings — none of it is a
 * market fact. Credits use the default 1 credit = ₹0.01 conversion
 * (see lib/credits.ts); amounts below are derived from that rate.
 */

export interface Plan {
  id: PlanTier;
  name: string;
  /** Monthly price in ₹ (0 for the free plan). */
  priceInrMonthly: number;
  /** Months charged for the annual term — 10 = two months free. Configurable. */
  annualMonthsCharged: number;
  /** Recurring monthly credit allowance. */
  monthlyCredits: number;
  /** Daily free allowance (main source on the free plan). */
  dailyFreeCredits: number;
  tagline: string;
  highlights: string[];
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceInrMonthly: 0,
    annualMonthsCharged: 12,
    monthlyCredits: 0,
    dailyFreeCredits: 100,
    tagline: "Explore the platform with daily free credits.",
    highlights: [
      "100 free credits every day",
      "Eligible budget models (Haiku, Luna, Flash-Lite)",
      "Basic chat + model explorer",
      "7-day conversation history",
      "Community support",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    priceInrMonthly: 299,
    annualMonthsCharged: 10,
    monthlyCredits: 25_000,
    dailyFreeCredits: 0,
    tagline: "For creators and daily drivers.",
    highlights: [
      "25,000 credits per month",
      "Mid-tier Claude, GPT and Gemini models",
      "Higher rate limits + longer history",
      "File uploads (plan limits apply)",
      "Basic API access",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceInrMonthly: 799,
    annualMonthsCharged: 10,
    monthlyCredits: 75_000,
    dailyFreeCredits: 0,
    tagline: "For professionals who live in the models.",
    highlights: [
      "75,000 credits per month",
      "Premium + reasoning models (Opus, Sol, Argon)",
      "Coding assistant + prompt library",
      "MCP access + more API requests",
      "Priority support",
    ],
    popular: true,
  },
  {
    id: "ultra",
    name: "Ultra",
    priceInrMonthly: 1_499,
    annualMonthsCharged: 10,
    monthlyCredits: 160_000,
    dailyFreeCredits: 0,
    tagline: "Heavy workloads, multi-model workflows.",
    highlights: [
      "160,000 credits per month",
      "Frontier models (GPT-6 Astra, Gemini 4 Carbon)",
      "Multi-model comparison workspace",
      "Advanced API usage + larger files",
      "MCP integrations",
    ],
  },
  {
    id: "max",
    name: "Max",
    priceInrMonthly: 2_999,
    annualMonthsCharged: 10,
    monthlyCredits: 350_000,
    dailyFreeCredits: 0,
    tagline: "The full platform, prioritized.",
    highlights: [
      "350,000 credits per month",
      "Every available model incl. Claude Fable 5.2",
      "Maximum rate limits + concurrency",
      "Agent workflows + extended analytics",
      "Priority processing + premium support",
    ],
  },
];

export interface TopUpPack {
  id: string;
  name: string;
  priceInr: number;
  credits: number;
}

/**
 * Top-up packs (master spec §7). Credit amounts follow the default
 * ₹0.01-per-credit rate; the admin can adjust amounts and attach
 * promotional bonus credits after cost analysis.
 */
export const TOP_UP_PACKS: TopUpPack[] = [
  { id: "mini", name: "Mini", priceInr: 99, credits: 9_900 },
  { id: "starter", name: "Starter", priceInr: 199, credits: 19_800 },
  { id: "creator", name: "Creator", priceInr: 499, credits: 49_900 },
  { id: "advanced", name: "Advanced", priceInr: 999, credits: 99_900 },
  { id: "ultimate", name: "Ultimate", priceInr: 1_999, credits: 199_900 },
];

export function planIndex(tier: PlanTier): number {
  return ["free", "plus", "pro", "ultra", "max"].indexOf(tier);
}

export function getPlan(id: PlanTier): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
