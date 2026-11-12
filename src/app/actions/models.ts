"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { modelPlanEligibility, modelPricing, models, plans, providers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

export interface ModelActionState {
  error?: string;
  notice?: string;
}

const PLAN_ORDER = ["free", "plus", "pro", "ultra", "max"] as const;

const nullablePositiveInteger = z.preprocess(
  (value) => value === "" || value === null || value === undefined ? null : Number(value),
  z.number().int().min(1).max(10_000_000).nullable(),
);
const nullablePrice = z.preprocess(
  (value) => value === "" || value === null || value === undefined ? null : Number(value),
  z.number().min(0).max(100_000).nullable(),
);

const modelSchema = z.object({
  modelId: z.string().uuid().optional(),
  slug: z.string().trim().min(2).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, "Use a valid provider model ID."),
  name: z.string().trim().min(2).max(100),
  providerId: z.uuid(),
  category: z.enum(["claude", "gpt", "gemini", "open_source"]),
  status: z.enum(["available", "preview", "deprecated"]),
  active: z.boolean(),
  verified: z.boolean(),
  capabilities: z.object({ vision: z.boolean(), tools: z.boolean(), reasoning: z.boolean() }),
  contextWindow: nullablePositiveInteger,
  maxOutput: nullablePositiveInteger,
  markupPct: z.number().int().min(0).max(500),
  minPlanId: z.enum(PLAN_ORDER),
  sourceUrl: z.string().url().nullable(),
  notes: z.string().max(1_000),
  inputPrice: nullablePrice,
  outputPrice: nullablePrice,
  verifiedAt: z.string().nullable(),
});

export async function saveModelAction(
  _state: ModelActionState,
  formData: FormData,
): Promise<ModelActionState> {
  let adminId: string;
  try {
    adminId = (await requireAdmin()).id;
  } catch {
    return { error: "Admin access is required to manage the model registry." };
  }

  const rawModelId = String(formData.get("modelId") ?? "").trim();
  const verifiedAtRaw = String(formData.get("verifiedAt") ?? "").trim();
  const parsed = modelSchema.safeParse({
    modelId: rawModelId || undefined,
    slug: formData.get("slug"),
    name: formData.get("name"),
    providerId: formData.get("providerId"),
    category: formData.get("category"),
    status: formData.get("status"),
    active: formData.get("active") === "on",
    verified: formData.get("verified") === "on",
    capabilities: {
      vision: formData.get("vision") === "on",
      tools: formData.get("tools") === "on",
      reasoning: formData.get("reasoning") === "on",
    },
    contextWindow: formData.get("contextWindow"),
    maxOutput: formData.get("maxOutput"),
    markupPct: Number(formData.get("markupPct")),
    minPlanId: formData.get("minPlanId"),
    sourceUrl: String(formData.get("sourceUrl") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? ""),
    inputPrice: formData.get("inputPrice"),
    outputPrice: formData.get("outputPrice"),
    verifiedAt: verifiedAtRaw || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the model details." };
  }
  const values = parsed.data;
  if (values.inputPrice === null !== (values.outputPrice === null)) {
    return { error: "Enter both input and output prices, or leave both blank." };
  }
  if (values.active && !values.verified) {
    return { error: "Verify model details against the provider docs before making it active." };
  }
  if (values.verified && !values.sourceUrl) {
    return { error: "Add the official provider documentation URL before marking this model verified." };
  }

  try {
    const [provider] = await db.select({ id: providers.id }).from(providers)
      .where(eq(providers.id, values.providerId)).limit(1);
    if (!provider) return { error: "Choose a provider from the registry." };
    const [plan] = await db.select({ id: plans.id }).from(plans)
      .where(eq(plans.id, values.minPlanId)).limit(1);
    if (!plan) return { error: "Choose an existing plan tier." };

    const now = new Date();
    const verifiedAt = values.verified
      ? values.verifiedAt && !Number.isNaN(new Date(`${values.verifiedAt}T00:00:00Z`).getTime())
        ? new Date(`${values.verifiedAt}T00:00:00Z`)
        : now
      : null;

    const modelId = await db.transaction(async (tx) => {
      const modelValues = {
        slug: values.slug,
        name: values.name,
        providerId: values.providerId,
        category: values.category,
        status: values.status,
        active: values.active,
        capabilities: values.capabilities,
        contextWindow: values.contextWindow,
        maxOutput: values.maxOutput,
        markupPct: values.markupPct,
        minPlanId: values.minPlanId,
        lastVerifiedAt: verifiedAt,
        sourceUrl: values.sourceUrl,
        notes: values.notes || null,
        updatedAt: now,
      };
      const [saved] = values.modelId
        ? await tx.update(models).set(modelValues).where(eq(models.id, values.modelId)).returning({ id: models.id })
        : await tx.insert(models).values(modelValues).returning({ id: models.id });
      if (!saved) throw new Error("Model not found.");

      if (values.inputPrice !== null && values.outputPrice !== null) {
        await tx.insert(modelPricing).values({
          modelId: saved.id,
          inputUsdMicroPerMTok: Math.round(values.inputPrice * 1_000_000),
          outputUsdMicroPerMTok: Math.round(values.outputPrice * 1_000_000),
          updatedAt: now,
        }).onConflictDoUpdate({
          target: modelPricing.modelId,
          set: {
            inputUsdMicroPerMTok: Math.round(values.inputPrice * 1_000_000),
            outputUsdMicroPerMTok: Math.round(values.outputPrice * 1_000_000),
            updatedAt: now,
          },
        });
      } else {
        await tx.delete(modelPricing).where(eq(modelPricing.modelId, saved.id));
      }

      await tx.delete(modelPlanEligibility).where(eq(modelPlanEligibility.modelId, saved.id));
      const minIndex = PLAN_ORDER.indexOf(values.minPlanId);
      await tx.insert(modelPlanEligibility).values(
        PLAN_ORDER.slice(minIndex).map((planId) => ({ modelId: saved.id, planId })),
      );
      return saved.id;
    });

    await writeAudit({
      actorUserId: adminId,
      action: values.modelId ? "admin.model_updated" : "admin.model_created",
      entityType: "model",
      entityId: modelId,
      metadata: { slug: values.slug, providerId: values.providerId, active: values.active, verified: values.verified },
    });
    revalidatePath("/dashboard/admin/models");
    updateTag("model-catalog");
    revalidatePath("/models");
    revalidatePath("/");
    return { notice: values.modelId ? "Model details saved." : "Model added to the registry." };
  } catch (error) {
    console.error("[model registry] save failed", error);
    return { error: "Could not save this model. Check for a duplicate model ID and try again." };
  }
}
