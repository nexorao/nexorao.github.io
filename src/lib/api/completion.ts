import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { approximateTokens, chargeForUsage } from "@/lib/chat/billing";
import { getChatModelAccess } from "@/lib/chat/queries";
import { getProviderAdapter } from "@/lib/providers";
import type { CompletionResult, ProviderMessage } from "@/lib/providers/types";
import { getSettings } from "@/lib/settings";
import { ensureDailyGrant, InsufficientCreditsError, reserveCredits, commitReservation, releaseReservation } from "@/lib/wallet";
import { apiKeyMonthlyUsage } from "@/lib/api-keys";

export class ApiCompletionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiCompletionError";
  }
}

export type ApiCompletionInput = {
  userId: string;
  apiKeyId: string;
  model: string;
  messages: ProviderMessage[];
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  monthlyLimitCredits?: number | null;
};

export type ApiCompletionEvent =
  | { type: "started"; id: string; model: string; created: number }
  | { type: "delta"; text: string }
  | { type: "completed"; id: string; model: string; created: number; text: string; usage: CompletionResult["usage"]; creditsCharged: number; finishReason: string | null };

/** One billing/persistence path shared by REST and MCP requests. */
export async function* streamApiCompletion(input: ApiCompletionInput): AsyncGenerator<ApiCompletionEvent> {
  if (!input.messages.length || input.messages.length > 40) throw new ApiCompletionError("Provide between 1 and 40 messages.", 400);
  const totalChars = input.messages.reduce((sum, message) => sum + contentSize(message.content), input.system?.length ?? 0);
  if (totalChars > 12_000_000) throw new ApiCompletionError("The conversation is too large.", 413);

  const model = await getChatModelAccess(input.userId, input.model);
  if (!model) throw new ApiCompletionError("This model is unavailable on your current plan.", 404);
  const maxOutputTokens = Math.max(1, Math.min(model.maxOutput, Math.trunc(input.maxOutputTokens ?? 2048), 8192));
  const inputEstimate = input.messages.reduce((sum, message) => sum + estimateMessageTokens(message.content), approximateTokens(input.system ?? ""));
  const settings = await getSettings();
  const price = {
    inputUsdMicroPerMTok: model.inputUsdMicroPerMTok,
    outputUsdMicroPerMTok: model.outputUsdMicroPerMTok,
    cachedUsdMicroPerMTok: model.cachedUsdMicroPerMTok,
    reasoningUsdMicroPerMTok: model.reasoningUsdMicroPerMTok,
    markupPct: model.markupPct,
  };
  const reserveEstimate = chargeForUsage(price, {
    inputTokens: inputEstimate, outputTokens: maxOutputTokens, cachedInputTokens: 0, reasoningOutputTokens: 0,
  }, settings);
  if (input.monthlyLimitCredits !== null && input.monthlyLimitCredits !== undefined) {
    const used = await apiKeyMonthlyUsage(input.apiKeyId);
    if (used + reserveEstimate > input.monthlyLimitCredits) {
      throw new ApiCompletionError("This API key has reached its monthly credit limit.", 429);
    }
  }
  await ensureDailyGrant(input.userId);
  const requestKey = randomUUID();
  let reservationId: string;
  try {
    ({ reservationId } = await reserveCredits({
      userId: input.userId,
      estimatedCredits: reserveEstimate,
      idempotencyKey: `api:${input.apiKeyId}:${requestKey}`,
    }));
  } catch (error) {
    if (error instanceof InsufficientCreditsError) throw new ApiCompletionError("There are not enough credits for this response.", 402);
    throw error;
  }

  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  let conversationId: string | null = null;
  let messageId: string | null = null;
  let settled = false;
  const startedAt = Date.now();
  let text = "";
  try {
    const title = contentText(input.messages.at(-1)?.content ?? "").replace(/\s+/g, " ").slice(0, 72) || "API request";
    const [conversation] = await db.insert(chatConversations).values({ userId: input.userId, title }).returning({ id: chatConversations.id });
    conversationId = conversation.id;
    await db.insert(chatMessages).values({
      conversationId,
      role: "user",
      content: JSON.stringify(input.messages.map((message) => ({
        role: message.role,
        content: contentText(message.content) || (Array.isArray(message.content) && message.content.some((part) => part.type === "image") ? "[Image attached]" : ""),
      }))),
      status: "complete",
    });
    const [assistant] = await db.insert(chatMessages).values({
      conversationId, role: "assistant", content: "", modelId: model.dbId, status: "streaming",
      creditReservationId: reservationId, requestKey, apiKeyId: input.apiKeyId,
    }).returning({ id: chatMessages.id });
    messageId = assistant.id;
    yield { type: "started", id, model: model.id, created };

    const abort = new AbortController();
    const abortFromCaller = () => abort.abort();
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    let finalUsage: CompletionResult["usage"] | null = null;
    let requestId: string | null = null;
    let finishReason: string | null = null;
    try {
      for await (const event of getProviderAdapter(model.config.adapter).stream(model.config, {
        model: model.id,
        messages: input.messages,
        system: input.system,
        maxOutputTokens,
        temperature: input.temperature,
      }, abort.signal)) {
        if (event.type === "delta") {
          text += event.text;
          yield { type: "delta", text: event.text };
        } else {
          finalUsage = event.usage;
          requestId = event.requestId;
          finishReason = event.finishReason;
        }
      }
    } finally {
      input.signal?.removeEventListener("abort", abortFromCaller);
    }
    if (!finalUsage) throw new Error("Provider stream ended without usage details.");
    const usage = finalUsage.inputTokens || finalUsage.outputTokens ? finalUsage : {
      inputTokens: inputEstimate, outputTokens: approximateTokens(text), cachedInputTokens: 0, reasoningOutputTokens: 0,
    };
    const charged = chargeForUsage(price, usage, settings);
    const settlement = await commitReservation(reservationId, charged);
    settled = true;
    await db.update(chatMessages).set({
      content: text, status: "complete", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens, reasoningOutputTokens: usage.reasoningOutputTokens,
      creditsCharged: settlement.charged, providerRequestId: requestId, latencyMs: Date.now() - startedAt,
    }).where(eq(chatMessages.id, messageId));
    await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, conversationId));
    yield { type: "completed", id, model: model.id, created, text, usage, creditsCharged: settlement.charged, finishReason };
  } catch (error) {
    if (!settled) await releaseReservation(reservationId, "api_completion_failed").catch((releaseError) => console.error("[api] reservation release failed", releaseError));
    if (messageId) await db.update(chatMessages).set({ content: text, status: "failed", latencyMs: Date.now() - startedAt })
      .where(eq(chatMessages.id, messageId)).catch((writeError) => console.error("[api] failed request log update", writeError));
    throw error;
  } finally {
    if (!settled) {
      await releaseReservation(reservationId, "api_completion_cancelled").catch((releaseError) => console.error("[api] cancelled reservation release failed", releaseError));
      if (messageId) await db.update(chatMessages).set({ content: text, status: "failed", latencyMs: Date.now() - startedAt })
        .where(eq(chatMessages.id, messageId)).catch((writeError) => console.error("[api] cancelled request log update failed", writeError));
    }
  }
}

function contentText(content: ProviderMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.filter((part) => part.type === "text").map((part) => part.text).join(" ");
}

function contentSize(content: ProviderMessage["content"]): number {
  if (typeof content === "string") return content.length;
  return content.reduce((sum, part) => sum + (part.type === "text" ? part.text.length : part.data.length), 0);
}

function estimateMessageTokens(content: ProviderMessage["content"]): number {
  if (typeof content === "string") return approximateTokens(content);
  return content.reduce((sum, part) => sum + (part.type === "text" ? approximateTokens(part.text) : 1_024), 0);
}

export async function completeApiChat(input: ApiCompletionInput) {
  let result: Extract<ApiCompletionEvent, { type: "completed" }> | null = null;
  for await (const event of streamApiCompletion(input)) {
    if (event.type === "completed") result = event;
  }
  if (!result) throw new ApiCompletionError("The provider did not complete this response.", 502);
  return result;
}
