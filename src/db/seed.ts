/**
 * Database seed (Phase 2). Idempotent: safe to re-run (upserts by natural
 * keys). Populates roles, plans, plan limits, top-up packs, platform
 * settings, providers, and the model registry seed from the Phase-1
 * verified data (2026-11-11, official provider docs).
 *
 * HONESTY RULES: every seeded value is either a spec proposal (plans,
 * packs — labeled configurable) or verified model data (with dates +
 * source URLs). Unverified models are seeded INACTIVE until an admin
 * verifies them. The admin account is created only when SEED_ADMIN_EMAIL +
 * SEED_ADMIN_PASSWORD are explicitly provided.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { loadLocalEnv } from "./run-migrations";
import {
  plans,
  planLimits,
  providers,
  roles,
  settings,
  topupPacks,
  users,
  userRoles,
  modelPlanEligibility,
  modelPricing,
  models,
} from "./schema";
import { hashPassword } from "../lib/crypto/password";
import { SETTINGS_DEFAULTS, SETTINGS_DESCRIPTIONS } from "../lib/settings-defaults";

loadLocalEnv();
const env = process.env;
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set (.env.local or environment).");
  process.exit(1);
}

// The seed owns its connection lifecycle (plain Node process).
const sdb = createDb(databaseUrl);

// ---------------------------------------------------------------------------
// Plan seed — PROPOSED LAUNCH PRICING (spec §7), admin-configurable.
// ---------------------------------------------------------------------------

const PLAN_SEED = [
  {
    id: "free",
    name: "Free",
    tagline: "Explore the platform with daily free credits.",
    pricePaiseMonthly: 0,
    annualMonthsCharged: 12,
    monthlyCredits: 0,
    dailyFreeCredits: 100,
    popular: false,
    sortOrder: 0,
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
    tagline: "For creators and daily drivers.",
    pricePaiseMonthly: 29900,
    annualMonthsCharged: 10,
    monthlyCredits: 25000,
    dailyFreeCredits: 0,
    popular: false,
    sortOrder: 1,
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
    tagline: "For professionals who live in the models.",
    pricePaiseMonthly: 79900,
    annualMonthsCharged: 10,
    monthlyCredits: 75000,
    dailyFreeCredits: 0,
    popular: true,
    sortOrder: 2,
    highlights: [
      "75,000 credits per month",
      "Premium + reasoning models (Opus, Sol, Argon)",
      "Coding assistant + prompt library",
      "MCP access + more API requests",
      "Priority support",
    ],
  },
  {
    id: "ultra",
    name: "Ultra",
    tagline: "Heavy workloads, multi-model workflows.",
    pricePaiseMonthly: 149900,
    annualMonthsCharged: 10,
    monthlyCredits: 160000,
    dailyFreeCredits: 0,
    popular: false,
    sortOrder: 3,
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
    tagline: "The full platform, prioritized.",
    pricePaiseMonthly: 299900,
    annualMonthsCharged: 10,
    monthlyCredits: 350000,
    dailyFreeCredits: 0,
    popular: false,
    sortOrder: 4,
    highlights: [
      "350,000 credits per month",
      "Every available model incl. Claude Fable 5.2",
      "Maximum rate limits + concurrency",
      "Agent workflows + extended analytics",
      "Priority processing + premium support",
    ],
  },
] as const;

const PLAN_LIMITS_SEED: Record<string, Record<string, unknown>> = {
  free: { max_output_tokens: 4096, requests_per_day: 50, concurrency: 1, file_upload_mb: 0, context_tokens: 128000 },
  plus: { max_output_tokens: 16384, requests_per_day: 500, concurrency: 2, file_upload_mb: 10, context_tokens: 400000 },
  pro: { max_output_tokens: 64000, requests_per_day: 2000, concurrency: 4, file_upload_mb: 25, context_tokens: 1000000 },
  ultra: { max_output_tokens: 128000, requests_per_day: 5000, concurrency: 8, file_upload_mb: 50, context_tokens: 1000000 },
  max: { max_output_tokens: 128000, requests_per_day: 20000, concurrency: 16, file_upload_mb: 100, context_tokens: 1050000 },
};

// ---------------------------------------------------------------------------
// Model seed — verified 2026-11-11 against official provider docs (Phase 1).
// Prices in micro-USD per 1M tokens ($8 → 8_000_000).
// ---------------------------------------------------------------------------

const PROVIDER_SEED = [
  { slug: "anthropic", name: "Anthropic", adapter: "anthropic", baseUrl: "https://api.anthropic.com", notes: "Official API only. Store the master key via admin (encrypted) before enabling." },
  { slug: "openai", name: "OpenAI", adapter: "openai", baseUrl: "https://api.openai.com/v1", notes: "Official API only. Store the master key via admin (encrypted) before enabling." },
  { slug: "google", name: "Google", adapter: "gemini", baseUrl: "https://generativelanguage.googleapis.com", notes: "Official API only. Store the master key via admin (encrypted) before enabling." },
  { slug: "openrouter", name: "OpenRouter (authorized host for open-weight models)", adapter: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", notes: "Authorized host for open-weight models. Verify model IDs and rates before enabling." },
] as const;

const MODEL_SEED = [
  {
    slug: "claude-fable-5-2", name: "Claude Fable 5.2", provider: "anthropic", category: "claude" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000, maxOutput: 128_000, markupPct: 15, minPlan: "max",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://platform.claude.com/docs/en/models/overview",
    input: 8_000_000, output: 40_000_000, active: true,
    notes: "Demanding reasoning and long-horizon agentic work.",
  },
  {
    slug: "claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic", category: "claude" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000, maxOutput: 128_000, markupPct: 15, minPlan: "pro",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://platform.claude.com/docs/en/models/overview",
    input: 4_000_000, output: 20_000_000, active: true,
    notes: "Long-running agentic coding and knowledge work.",
  },
  {
    slug: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic", category: "claude" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000, maxOutput: 128_000, markupPct: 15, minPlan: "plus",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://platform.claude.com/docs/en/models/overview",
    input: 2_000_000, output: 10_000_000, active: true,
    notes: "Best combination of speed and intelligence.",
  },
  {
    slug: "claude-haiku-5-5", name: "Claude Haiku 5.5", provider: "anthropic", category: "claude" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: false, streaming: true, json: true },
    contextWindow: 1_000_000, maxOutput: 128_000, markupPct: 15, minPlan: "free",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://platform.claude.com/docs/en/models/overview",
    input: 100_000, output: 500_000, active: true,
    notes: "From-pricing: list rates start at $0.10/$0.50 per MTok.",
  },
  {
    slug: "gpt-6-astra", name: "GPT-6 Astra", provider: "openai", category: "gpt" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_050_000, maxOutput: 128_000, markupPct: 15, minPlan: "ultra",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://developers.openai.com/api/docs/models",
    input: 10_000_000, output: 50_000_000, active: true,
    notes: "Flagship model for the most demanding work.",
  },
  {
    slug: "gpt-6.1-sol", name: "GPT-6.1 Sol", provider: "openai", category: "gpt" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_050_000, maxOutput: 128_000, markupPct: 15, minPlan: "pro",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://developers.openai.com/api/docs/models",
    input: 2_000_000, output: 10_000_000, active: true,
    notes: "Near-Astra performance at a lower cost.",
  },
  {
    slug: "gpt-6.1-terra", name: "GPT-6.1 Terra", provider: "openai", category: "gpt" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_050_000, maxOutput: 128_000, markupPct: 15, minPlan: "plus",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://developers.openai.com/api/docs/models",
    input: 1_000_000, output: 5_000_000, active: true,
    notes: "Fast visual reasoning and natural writing.",
  },
  {
    slug: "gpt-6-luna", name: "GPT-6 Luna", provider: "openai", category: "gpt" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_050_000, maxOutput: 128_000, markupPct: 15, minPlan: "free",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://developers.openai.com/api/docs/models",
    input: 100_000, output: 500_000, active: true,
    notes: "Most efficient model for high-volume tasks.",
  },
  {
    slug: "gemini-4-carbon", name: "Gemini 4 Carbon", provider: "google", category: "gemini" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000, maxOutput: 65_000, markupPct: 15, minPlan: "ultra",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    input: 2_000_000, output: 10_000_000, active: true,
    notes: "Scheduled price change: $4/$20 per MTok starting 2026-12-01 per Google docs.",
  },
  {
    slug: "gemini-4-argon", name: "Gemini 4 Argon", provider: "google", category: "gemini" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: 1_000_000, maxOutput: 65_000, markupPct: 15, minPlan: "pro",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    input: 2_000_000, output: 10_000_000, active: true,
    notes: "Scheduled price change: $4/$20 per MTok starting 2026-12-01 per Google docs.",
  },
  {
    slug: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "google", category: "gemini" as const,
    status: "available" as const, capabilities: { vision: true, tools: true, reasoning: true },
    contextWindow: null, maxOutput: null, markupPct: 15, minPlan: "plus",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    input: 750_000, output: 3_750_000, active: true,
    notes: "Pricing $0.75/$3.75 through 2026-12-31, then $1.50/$7.50. Context window to be verified by admin.",
  },
  {
    slug: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", provider: "google", category: "gemini" as const,
    status: "available" as const, capabilities: { vision: true, tools: false, reasoning: false },
    contextWindow: null, maxOutput: null, markupPct: 15, minPlan: "free",
    lastVerifiedAt: "2026-11-11", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    input: 300_000, output: 2_500_000, active: true,
    notes: "High-volume, cost-efficient tasks. Context window to be verified by admin.",
  },
  // Unverified entries — seeded INACTIVE until an admin confirms them.
  {
    slug: "kimi-k3.1-pro", name: "Kimi K3.1 Pro", provider: "openrouter", category: "open_source" as const,
    status: "available" as const, capabilities: { vision: false, tools: true, reasoning: true },
    contextWindow: null, maxOutput: null, markupPct: 15, minPlan: "pro",
    lastVerifiedAt: null, sourceUrl: null,
    input: 2_000_000, output: 10_000_000, active: false,
    notes: "UNVERIFIED — reported $2/$10 per MTok (secondary sources only). Verify model ID, context and pricing before enabling.",
  },
  {
    slug: "glm-5.2", name: "GLM 5.2", provider: "openrouter", category: "open_source" as const,
    status: "available" as const, capabilities: { vision: false, tools: true, reasoning: true },
    contextWindow: null, maxOutput: null, markupPct: 15, minPlan: "pro",
    lastVerifiedAt: null, sourceUrl: null,
    input: null, output: null, active: false,
    notes: "UNVERIFIED — open-weight, host-dependent pricing. Admin to verify ID and rates.",
  },
  {
    slug: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", provider: "openrouter", category: "open_source" as const,
    status: "available" as const, capabilities: { vision: false, tools: true, reasoning: true },
    contextWindow: null, maxOutput: null, markupPct: 15, minPlan: "pro",
    lastVerifiedAt: null, sourceUrl: null,
    input: null, output: null, active: false,
    notes: "UNVERIFIED — open-weight, host-dependent pricing. Admin to verify ID and rates.",
  },
] as const;

const TOPUP_SEED = [
  { id: "mini", name: "Mini", pricePaise: 9900, credits: 9900, bonusCredits: 0, sortOrder: 0 },
  { id: "starter", name: "Starter", pricePaise: 19900, credits: 19800, bonusCredits: 0, sortOrder: 1 },
  { id: "creator", name: "Creator", pricePaise: 49900, credits: 49900, bonusCredits: 0, sortOrder: 2 },
  { id: "advanced", name: "Advanced", pricePaise: 99900, credits: 99900, bonusCredits: 0, sortOrder: 3 },
  { id: "ultimate", name: "Ultimate", pricePaise: 199900, credits: 199900, bonusCredits: 0, sortOrder: 4 },
] as const;

const PLAN_TIER_ORDER = ["free", "plus", "pro", "ultra", "max"];

async function main() {
  console.log("[seed] starting…");

  // Roles
  for (const role of [
    { name: "user", description: "Standard platform access." },
    { name: "admin", description: "Full admin panel access; every action is audited." },
  ]) {
    await sdb.insert(roles).values(role).onConflictDoUpdate({
      target: roles.name,
      set: { description: role.description },
    });
  }

  // Plans + limits
  for (const plan of PLAN_SEED) {
    await sdb
      .insert(plans)
      .values({ ...plan, highlights: [...plan.highlights] })
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: plan.name,
          tagline: plan.tagline,
          highlights: [...plan.highlights],
          pricePaiseMonthly: plan.pricePaiseMonthly,
          annualMonthsCharged: plan.annualMonthsCharged,
          monthlyCredits: plan.monthlyCredits,
          dailyFreeCredits: plan.dailyFreeCredits,
          popular: plan.popular,
          sortOrder: plan.sortOrder,
          updatedAt: new Date(),
        },
      });
    for (const [key, value] of Object.entries(PLAN_LIMITS_SEED[plan.id])) {
      await sdb
        .insert(planLimits)
        .values({ planId: plan.id, key, value })
        .onConflictDoUpdate({
          target: [planLimits.planId, planLimits.key],
          set: { value },
        });
    }
  }

  // Top-up packs
  for (const pack of TOPUP_SEED) {
    await sdb.insert(topupPacks).values(pack).onConflictDoUpdate({
      target: topupPacks.id,
      set: {
        name: pack.name,
        pricePaise: pack.pricePaise,
        credits: pack.credits,
        bonusCredits: pack.bonusCredits,
        sortOrder: pack.sortOrder,
      },
    });
  }

  // Settings defaults (DB rows make the current values inspectable/editable)
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    await sdb
      .insert(settings)
      .values({ key, value: value as never, description: SETTINGS_DESCRIPTIONS[key as keyof typeof SETTINGS_DESCRIPTIONS] })
      .onConflictDoNothing({ target: settings.key });
  }

  // Providers
  for (const provider of PROVIDER_SEED) {
    await sdb
      .insert(providers)
      .values(provider)
      .onConflictDoUpdate({
        target: providers.slug,
        set: {
          name: provider.name,
          adapter: provider.adapter,
          baseUrl: provider.baseUrl,
          notes: provider.notes,
          updatedAt: new Date(),
        },
      });
  }
  const providerRows = await sdb.select().from(providers);
  const providerBySlug = new Map(providerRows.map((p) => [p.slug, p]));

  // Models + pricing + eligibility
  for (const model of MODEL_SEED) {
    const provider = providerBySlug.get(model.provider);
    if (!provider) throw new Error(`Seed error: provider ${model.provider} missing`);

    const [row] = await sdb
      .insert(models)
      .values({
        slug: model.slug,
        providerId: provider.id,
        name: model.name,
        category: model.category,
        status: model.status,
        capabilities: model.capabilities,
        contextWindow: model.contextWindow,
        maxOutput: model.maxOutput,
        markupPct: model.markupPct,
        minPlanId: model.minPlan,
        lastVerifiedAt: model.lastVerifiedAt ? new Date(`${model.lastVerifiedAt}T00:00:00Z`) : null,
        sourceUrl: model.sourceUrl,
        notes: model.notes,
        active: model.active,
      })
      .onConflictDoUpdate({
        target: models.slug,
        set: {
          name: model.name,
          providerId: provider.id,
          category: model.category,
          status: model.status,
          capabilities: model.capabilities,
          contextWindow: model.contextWindow,
          maxOutput: model.maxOutput,
          markupPct: model.markupPct,
          minPlanId: model.minPlan,
          lastVerifiedAt: model.lastVerifiedAt ? new Date(`${model.lastVerifiedAt}T00:00:00Z`) : null,
          sourceUrl: model.sourceUrl,
          notes: model.notes,
          active: model.active,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (model.input !== null && model.output !== null) {
      await sdb
        .insert(modelPricing)
        .values({
          modelId: row.id,
          inputUsdMicroPerMTok: model.input,
          outputUsdMicroPerMTok: model.output,
        })
        .onConflictDoUpdate({
          target: modelPricing.modelId,
          set: {
            inputUsdMicroPerMTok: model.input,
            outputUsdMicroPerMTok: model.output,
            updatedAt: new Date(),
          },
        });
    }

    // Eligibility: every plan at or above minPlan (tier order).
    const minIdx = PLAN_TIER_ORDER.indexOf(model.minPlan);
    const eligiblePlans = PLAN_TIER_ORDER.slice(minIdx);
    await sdb.delete(modelPlanEligibility).where(eq(modelPlanEligibility.modelId, row.id));
    await sdb.insert(modelPlanEligibility).values(
      eligiblePlans.map((planId) => ({ modelId: row.id, planId })),
    );
  }

  // Optional admin account — ONLY with explicit env credentials.
  const adminEmail = env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const [existing] = await sdb.select().from(users).where(eq(users.email, adminEmail)).limit(1);
    if (existing) {
      await sdb
        .insert(userRoles)
        .values({ userId: existing.id, roleName: "admin" })
        .onConflictDoNothing();
      console.log(`[seed] admin already exists: ${adminEmail}`);
    } else {
      const [admin] = await sdb
        .insert(users)
        .values({
          email: adminEmail,
          name: "Platform Admin",
          passwordHash: hashPassword(adminPassword),
          emailVerifiedAt: new Date(),
        })
        .returning();
      await sdb.insert(userRoles).values([
        { userId: admin.id, roleName: "user" },
        { userId: admin.id, roleName: "admin" },
      ]);
      console.log(`[seed] admin created: ${adminEmail}`);
    }
  } else {
    console.log(
      "[seed] no admin account created — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.",
    );
  }

  // Report
  const allModels = await sdb.select({ slug: models.slug, active: models.active }).from(models);
  const activeCount = allModels.filter((m) => m.active).length;
  console.log(`[seed] done — ${allModels.length} models (${activeCount} active, ${allModels.length - activeCount} inactive/unverified)`);
  console.log("[seed] plans:", PLAN_SEED.map((p) => p.id).join(", "));
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
