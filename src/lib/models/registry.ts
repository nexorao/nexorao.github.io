import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  modelPricing,
  models,
  providers,
  type ModelRow,
} from "@/db/schema";
import type { ModelEntry, PlanTier, ProviderCategory } from "@/data/models";

export interface RegistryModelRow {
  dbId: string;
  id: string;
  name: string;
  providerId: string;
  provider: string;
  providerSlug: string;
  category: ProviderCategory;
  status: ModelRow["status"];
  active: boolean;
  capabilities: ModelRow["capabilities"];
  contextWindow: number | null;
  maxOutput: number | null;
  markupPct: number;
  minPlan: PlanTier;
  lastVerified: string | null;
  sourceUrl: string | null;
  notes: string;
  inputUsdMicroPerMTok: number | null;
  outputUsdMicroPerMTok: number | null;
}

export async function listModelCatalog(): Promise<ModelEntry[]> {
  const rows = await selectModels();
  return rows.map(toCatalogEntry);
}

export async function listRegistryModels(): Promise<RegistryModelRow[]> {
  const rows = await selectModels();
  return rows.map((row) => ({
    dbId: row.id,
    id: row.slug,
    name: row.name,
    providerId: row.providerId,
    provider: row.providerName,
    providerSlug: row.providerSlug,
    category: toCategory(row.category),
    status: row.status,
    active: row.active,
    capabilities: row.capabilities,
    contextWindow: row.contextWindow,
    maxOutput: row.maxOutput,
    markupPct: row.markupPct,
    minPlan: row.minPlanId as PlanTier,
    lastVerified: row.lastVerifiedAt?.toISOString().slice(0, 10) ?? null,
    sourceUrl: row.sourceUrl,
    notes: row.notes ?? "",
    inputUsdMicroPerMTok: row.inputPrice,
    outputUsdMicroPerMTok: row.outputPrice,
  }));
}

async function selectModels() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 1800 });
  cacheTag("model-catalog");
  return db
    .select({
      id: models.id,
      slug: models.slug,
      name: models.name,
      providerId: models.providerId,
      providerName: providers.name,
      providerSlug: providers.slug,
      category: models.category,
      status: models.status,
      active: models.active,
      capabilities: models.capabilities,
      contextWindow: models.contextWindow,
      maxOutput: models.maxOutput,
      markupPct: models.markupPct,
      minPlanId: models.minPlanId,
      lastVerifiedAt: models.lastVerifiedAt,
      sourceUrl: models.sourceUrl,
      notes: models.notes,
      inputPrice: modelPricing.inputUsdMicroPerMTok,
      outputPrice: modelPricing.outputUsdMicroPerMTok,
    })
    .from(models)
    .innerJoin(providers, eq(providers.id, models.providerId))
    .leftJoin(modelPricing, eq(modelPricing.modelId, models.id))
    .orderBy(asc(providers.name), asc(models.name));
}

function toCatalogEntry(row: Awaited<ReturnType<typeof selectModels>>[number]): ModelEntry {
  return {
    id: row.slug,
    name: row.name,
    provider: row.providerName,
    category: toCategory(row.category),
    status: row.status,
    capabilities: row.capabilities,
    contextWindow: row.contextWindow,
    maxOutput: row.maxOutput,
    pricing:
      row.inputPrice === null || row.outputPrice === null
        ? null
        : {
            inputUsdPerMTok: row.inputPrice / 1_000_000,
            outputUsdPerMTok: row.outputPrice / 1_000_000,
          },
    markupPct: row.markupPct,
    minPlan: row.minPlanId as PlanTier,
    lastVerified: row.lastVerifiedAt?.toISOString().slice(0, 10) ?? null,
    sourceUrl: row.sourceUrl,
    notes: row.notes ?? undefined,
    active: row.active,
  };
}

function toCategory(category: ModelRow["category"]): ProviderCategory {
  return category === "open_source" ? "open-source" : category;
}
