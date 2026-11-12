import "server-only";
import { and, asc, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  chatConversations,
  chatMessages,
  modelPlanEligibility,
  modelPricing,
  models,
  providerCredentials,
  providers,
  subscriptions,
} from "@/db/schema";
import { decryptString } from "@/lib/crypto/totp";
import type { ProviderConfig } from "@/lib/providers/types";

export interface ChatModelOption {
  id: string;
  name: string;
  provider: string;
  status: "active" | "coming_soon" | "disabled";
  description: string;
  capabilities: { reasoning: boolean; vision: boolean; tools: boolean; streaming: boolean; json: boolean };
  contextWindow: number | null;
  maxOutput: number;
  minPlanId: string;
  locked: boolean;
  providerReady: boolean;
  imageInputSupported: boolean;
  inputUsdMicroPerMTok: number;
  outputUsdMicroPerMTok: number;
}

export interface ChatModelAccess extends ChatModelOption {
  dbId: string;
  contextWindow: number | null;
  markupPct: number;
  cachedUsdMicroPerMTok: number | null;
  reasoningUsdMicroPerMTok: number | null;
  config: ProviderConfig;
}

async function currentPlanId(userId: string): Promise<string> {
  const [sub] = await db
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        gt(subscriptions.currentPeriodEnd, new Date()),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);
  return sub?.planId ?? "free";
}

const PLAN_ORDER = ["free", "plus", "pro", "ultra", "max"];

function catalogQuery(planId: string) {
  return db
    .select({
      id: models.slug,
      dbId: models.id,
      name: models.name,
      provider: providers.name,
      providerSlug: providers.slug,
      adapter: providers.adapter,
      baseUrl: providers.baseUrl,
      maxOutput: models.maxOutput,
      contextWindow: models.contextWindow,
      minPlanId: models.minPlanId,
      notes: models.notes,
      capabilities: models.capabilities,
      active: models.active,
      status: models.status,
      providerEnabled: providers.enabled,
      credentialId: providerCredentials.id,
      markupPct: models.markupPct,
      inputPrice: modelPricing.inputUsdMicroPerMTok,
      outputPrice: modelPricing.outputUsdMicroPerMTok,
      cachedPrice: modelPricing.cachedUsdMicroPerMTok,
      reasoningPrice: modelPricing.reasoningUsdMicroPerMTok,
      ciphertext: providerCredentials.ciphertext,
      iv: providerCredentials.iv,
      authTag: providerCredentials.authTag,
    })
    .from(models)
    .innerJoin(providers, eq(providers.id, models.providerId))
    .leftJoin(providerCredentials, eq(providerCredentials.providerId, providers.id))
    .leftJoin(modelPricing, eq(modelPricing.modelId, models.id))
    .leftJoin(
      modelPlanEligibility,
      and(eq(modelPlanEligibility.modelId, models.id), eq(modelPlanEligibility.planId, planId)),
    )
    .where(and(eq(models.active, true), ne(models.status, "deprecated")))
    .orderBy(asc(providers.name), asc(models.name));
}

export function isAiChatEnabled() {
  return process.env.AI_CHAT_ENABLED === "true";
}

export async function listChatModels(userId: string): Promise<ChatModelOption[]> {
  const planId = await currentPlanId(userId);
  const rows = await catalogQuery(planId);
  const planIndex = Math.max(0, PLAN_ORDER.indexOf(planId));
  return rows.filter((row) => row.status !== "deprecated").map((row) => {
    const capabilities = row.capabilities as ChatModelOption["capabilities"];
    const isAnthropicEnvReady = row.providerSlug === "anthropic" && Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      status: row.status === "available" ? "active" : "coming_soon",
      description: row.notes ?? `${row.provider} model available in Nexora Playground.`,
      capabilities: {
        reasoning: Boolean(capabilities.reasoning),
        vision: Boolean(capabilities.vision),
        tools: Boolean(capabilities.tools),
        streaming: true,
        json: true,
      },
      contextWindow: row.contextWindow,
      maxOutput: row.maxOutput ?? 16_384,
      minPlanId: row.minPlanId,
      locked: planIndex < Math.max(0, PLAN_ORDER.indexOf(row.minPlanId)),
      providerReady: isAnthropicEnvReady || Boolean(row.providerEnabled && row.credentialId),
      imageInputSupported: ["anthropic", "openai", "openai-compatible"].includes(row.adapter),
      inputUsdMicroPerMTok: row.inputPrice ?? 0,
      outputUsdMicroPerMTok: row.outputPrice ?? 0,
    };
  });
}

export async function getChatModelAccess(
  userId: string,
  modelSlug: string,
): Promise<ChatModelAccess | null> {
  const planId = await currentPlanId(userId);
  const rows = await catalogQuery(planId);
  const row = rows.find((candidate) => candidate.id === modelSlug);
  if (!row || !row.active || row.status !== "available" || !row.maxOutput || !row.inputPrice || !row.outputPrice || !row.baseUrl) {
    return null;
  }
  if (Math.max(0, PLAN_ORDER.indexOf(planId)) < Math.max(0, PLAN_ORDER.indexOf(row.minPlanId))) return null;
  const envApiKey = row.providerSlug === "anthropic" ? process.env.ANTHROPIC_API_KEY?.trim() : undefined;
  const encryptedApiKey = row.ciphertext && row.iv && row.authTag
    ? decryptString({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag })
    : "";
  const apiKey = envApiKey || (row.providerEnabled ? encryptedApiKey : "");
  if (!apiKey) return null;
  const capabilities = row.capabilities as ChatModelOption["capabilities"];
  const planIndex = Math.max(0, PLAN_ORDER.indexOf(planId));
  return {
    id: row.id,
    dbId: row.dbId,
    name: row.name,
    provider: row.provider,
    status: "active",
    description: row.notes ?? `${row.provider} model available in Nexora Playground.`,
    capabilities: {
      reasoning: Boolean(capabilities.reasoning),
      vision: Boolean(capabilities.vision),
      tools: Boolean(capabilities.tools),
      streaming: capabilities.streaming ?? true,
      json: capabilities.json ?? true,
    },
    maxOutput: row.maxOutput,
    contextWindow: row.contextWindow,
    minPlanId: row.minPlanId,
    locked: planIndex < Math.max(0, PLAN_ORDER.indexOf(row.minPlanId)),
    providerReady: true,
    imageInputSupported: ["anthropic", "openai", "openai-compatible"].includes(row.adapter),
    markupPct: row.markupPct,
    inputUsdMicroPerMTok: row.inputPrice,
    outputUsdMicroPerMTok: row.outputPrice,
    cachedUsdMicroPerMTok: row.cachedPrice,
    reasoningUsdMicroPerMTok: row.reasoningPrice,
    config: {
      slug: row.providerSlug,
      name: row.provider,
      adapter: row.adapter as ProviderConfig["adapter"],
      baseUrl: row.baseUrl,
      apiKey,
    },
  };
}

export async function listUserConversations(userId: string) {
  return db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      updatedAt: chatConversations.updatedAt,
    })
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(30);
}

export async function getUserConversationMessages(userId: string, conversationId: string) {
  const [conversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)))
    .limit(1);
  if (!conversation) return null;

  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      status: chatMessages.status,
      model: models.name,
      creditsCharged: chatMessages.creditsCharged,
      inputTokens: chatMessages.inputTokens,
      outputTokens: chatMessages.outputTokens,
      latencyMs: chatMessages.latencyMs,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .leftJoin(models, eq(models.id, chatMessages.modelId))
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(100);
  return rows.reverse();
}
