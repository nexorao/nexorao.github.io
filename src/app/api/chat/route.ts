import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { requireUser, AuthError } from "@/lib/auth/session";
import { rateLimitAsync } from "@/lib/rate-limit";
import { ensureDailyGrant, reserveCredits, InsufficientCreditsError, commitReservation, releaseReservation } from "@/lib/wallet";
import { getSettings } from "@/lib/settings";
import { getChatModelAccess, getUserConversationMessages, isAiChatEnabled, listChatModels } from "@/lib/chat/queries";
import { approximateTokens, chargeForUsage } from "@/lib/chat/billing";
import { getProviderAdapter } from "@/lib/providers";
import type { CompletionResult, ProviderMessage } from "@/lib/providers/types";
import { PayloadTooLargeError, readRequestTextLimited } from "@/lib/http";

const requestSchema = z.object({
  conversationId: z.uuid().nullable().optional(),
  model: z.string().trim().min(2).max(160),
  prompt: z.string().trim().min(1).max(12_000),
  requestKey: z.uuid(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().min(1).max(128_000).optional(),
  systemPrompt: z.string().max(8_000).optional(),
  image: z.object({
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    data: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }).optional(),
});

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function authenticatedUser() {
  try {
    return { user: await requireUser(), response: null };
  } catch (error) {
    const status = error instanceof AuthError && error.code === "forbidden" ? 403 : 401;
    return { user: null, response: jsonError("Sign in to use chat.", status) };
  }
}

function event(controller: ReadableStreamDefaultController<Uint8Array>, name: string, value: unknown) {
  controller.enqueue(new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`));
}

export async function POST(request: Request) {
  const { user, response: authResponse } = await authenticatedUser();
  if (!user) return authResponse!;

  if (!isAiChatEnabled()) {
    return jsonError("Chat is currently unavailable on this deployment.", 503);
  }

  const limit = await rateLimitAsync(`chat:${user.id}`, 30, 60_000);
  if (!limit.allowed) {
    return jsonError("You are sending messages too quickly. Try again shortly.", 429, {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readRequestTextLimited(request, 7_500_000));
  } catch (error) {
    return jsonError(error instanceof PayloadTooLargeError ? error.message : "The chat request could not be read.", error instanceof PayloadTooLargeError ? 413 : 400);
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return jsonError("Check the model and message, then try again.", 400);
  const input = parsed.data;

  const existing = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.requestKey, input.requestKey))
    .limit(1);
  if (existing.length) return jsonError("This message has already been submitted.", 409);

  const model = await getChatModelAccess(user.id, input.model);
  if (!model) {
    const options = await listChatModels(user.id).catch(() => []);
    const selected = options.find((option) => option.id === input.model);
    if (!selected) return jsonError("This model is unavailable on your current plan.", 404);
    if (selected.locked) return jsonError(`Upgrade to ${selected.minPlanId} to use this model.`, 403);
    if (!selected.providerReady) return jsonError("This model is not connected yet. Contact your workspace admin.", 503);
    return jsonError("This model is not ready for requests yet. Contact your workspace admin.", 503);
  }
  if (input.image && !model.capabilities.vision) return jsonError("The selected model does not accept images.", 400);
  if (input.image && !["anthropic", "openai", "openai-compatible"].includes(model.config.adapter)) {
    return jsonError("Image input is not supported by this provider adapter yet.", 400);
  }

  let history: NonNullable<Awaited<ReturnType<typeof getUserConversationMessages>>> = [];
  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    const messages = await getUserConversationMessages(user.id, conversationId);
    if (!messages) return jsonError("Conversation not found.", 404);
    history = messages;
  }

  const maxOutputTokens = Math.max(1, Math.min(model.maxOutput, input.maxOutputTokens ?? 16_384));
  const contextLimit = Math.max(1_024, Math.min(model.contextWindow ?? 16_384, 64_000) - maxOutputTokens);
  const selectedHistory: { role: "user" | "assistant"; content: string }[] = [];
  let historyTokens = 0;
  for (const row of [...history].reverse()) {
    if (row.status !== "complete" || !row.content) continue;
    const tokens = approximateTokens(row.content);
    if (historyTokens + tokens > contextLimit - approximateTokens(input.prompt)) break;
    selectedHistory.unshift({ role: row.role, content: row.content });
    historyTokens += tokens;
    if (selectedHistory.length >= 24) break;
  }
  const currentMessage = input.image
    ? {
        role: "user" as const,
        content: [
          { type: "text" as const, text: input.prompt },
          { type: "image" as const, mediaType: input.image.mediaType, data: input.image.data },
        ],
      }
    : { role: "user" as const, content: input.prompt };
  const messages = [...selectedHistory, currentMessage];
  const inputEstimate = messages.reduce((sum, message) => sum + estimateMessageTokens(message.content), 0);
  const settings = await getSettings();
  const price = {
    inputUsdMicroPerMTok: model.inputUsdMicroPerMTok,
    outputUsdMicroPerMTok: model.outputUsdMicroPerMTok,
    cachedUsdMicroPerMTok: model.cachedUsdMicroPerMTok,
    reasoningUsdMicroPerMTok: model.reasoningUsdMicroPerMTok,
    markupPct: model.markupPct,
  };
  const reserveEstimate = chargeForUsage(
    price,
    { inputTokens: inputEstimate, outputTokens: maxOutputTokens, cachedInputTokens: 0, reasoningOutputTokens: 0 },
    settings,
  );

  await ensureDailyGrant(user.id);
  let reservationId: string;
  try {
    ({ reservationId } = await reserveCredits({
      userId: user.id,
      estimatedCredits: reserveEstimate,
      idempotencyKey: `chat:${user.id}:${input.requestKey}`,
    }));
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return jsonError("There are not enough credits for this response.", 402, {
        available: error.available,
        required: error.required,
      });
    }
    console.error("[chat] credit reservation failed", error);
    return jsonError("Could not reserve credits for this message.", 500);
  }

  try {
    if (!conversationId) {
      const title = input.prompt.replace(/\s+/g, " ").slice(0, 72) || "New chat";
      const [conversation] = await db
        .insert(chatConversations)
        .values({ userId: user.id, title })
        .returning({ id: chatConversations.id });
      conversationId = conversation.id;
    }
    await db.transaction(async (tx) => {
      await tx.insert(chatMessages).values({
        conversationId: conversationId!,
        role: "user",
        content: input.prompt,
      });
      await tx.insert(chatMessages).values({
        conversationId: conversationId!,
        role: "assistant",
        content: "",
        modelId: model.dbId,
        status: "streaming",
        creditReservationId: reservationId,
        requestKey: input.requestKey,
      });
      await tx
        .update(chatConversations)
        .set({ updatedAt: new Date() })
        .where(and(eq(chatConversations.id, conversationId!), eq(chatConversations.userId, user.id)));
    });
  } catch (error) {
    await releaseReservation(reservationId, "chat_message_setup_failed").catch((releaseError) => {
      console.error("[chat] failed to release unused reservation", releaseError);
    });
    console.error("[chat] message setup failed", error);
    return jsonError("Could not save this conversation.", 500);
  }

  const assistantRow = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.requestKey, input.requestKey))
    .limit(1);
  const assistantMessageId = assistantRow[0]?.id;
  if (!assistantMessageId) {
    await releaseReservation(reservationId, "chat_message_missing");
    return jsonError("Could not start this response.", 500);
  }

  const providerRequest = {
    model: model.id,
    messages,
    system: input.systemPrompt?.trim() || "You are Nexora, a helpful AI assistant. Answer clearly and accurately.",
    maxOutputTokens,
    temperature: input.temperature ?? 0.7,
    topP: input.topP ?? 1,
  };
  const abortController = new AbortController();
  const abortFromRequest = () => abortController.abort();
  request.signal.addEventListener("abort", abortFromRequest, { once: true });
  const startedAt = Date.now();
  let answer = "";
  let finalUsage: CompletionResult["usage"] | null = null;
  let providerRequestId: string | null = null;
  let finishReason: string | null = null;
  let settled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      event(controller, "conversation", { conversationId, messageId: assistantMessageId });
      try {
        for await (const providerEvent of getProviderAdapter(model.config.adapter).stream(
          model.config,
          providerRequest,
          abortController.signal,
        )) {
          if (providerEvent.type === "delta") {
            answer += providerEvent.text;
            event(controller, "delta", { text: providerEvent.text });
          } else {
            finalUsage = providerEvent.usage;
            providerRequestId = providerEvent.requestId;
            finishReason = providerEvent.finishReason;
          }
        }
        if (!finalUsage) throw new Error("Provider stream did not include usage details.");
        const actualUsage = finalUsage.inputTokens || finalUsage.outputTokens
          ? finalUsage
          : {
              inputTokens: inputEstimate,
              outputTokens: approximateTokens(answer),
              cachedInputTokens: 0,
              reasoningOutputTokens: 0,
            };
        const charged = chargeForUsage(price, actualUsage, settings);
        const settlement = await commitReservation(reservationId, charged);
        settled = true;
        await db
          .update(chatMessages)
          .set({
            content: answer,
            status: "complete",
            inputTokens: actualUsage.inputTokens,
            outputTokens: actualUsage.outputTokens,
            cachedInputTokens: actualUsage.cachedInputTokens,
            reasoningOutputTokens: actualUsage.reasoningOutputTokens,
            creditsCharged: settlement.charged,
            providerRequestId,
            latencyMs: Date.now() - startedAt,
          })
          .where(eq(chatMessages.id, assistantMessageId));
        await db
          .update(chatConversations)
          .set({ updatedAt: new Date() })
          .where(eq(chatConversations.id, conversationId!));
        event(controller, "complete", {
          conversationId,
          messageId: assistantMessageId,
          creditsCharged: settlement.charged,
          usage: actualUsage,
          finishReason,
        });
        controller.close();
      } catch (error) {
        const cancelled = abortController.signal.aborted;
        if (!settled) {
          await releaseReservation(reservationId, cancelled ? "chat_cancelled" : "provider_stream_failed")
            .catch((releaseError) => console.error("[chat] failed to release reservation", releaseError));
        }
        await db
          .update(chatMessages)
          .set({ content: answer, status: "failed", latencyMs: Date.now() - startedAt })
          .where(eq(chatMessages.id, assistantMessageId))
          .catch((writeError) => console.error("[chat] failed to mark message failed", writeError));
        if (!cancelled) {
          console.error("[chat] provider stream failed", error);
          try {
            event(controller, "error", { message: "The provider could not finish this response. Your unused hold was returned." });
            controller.close();
          } catch {
            // The client may have closed its stream while cleanup was running.
          }
        }
      } finally {
        request.signal.removeEventListener("abort", abortFromRequest);
      }
    },
    async cancel() {
      abortController.abort();
      if (!settled) {
        await releaseReservation(reservationId, "chat_stream_cancelled").catch((error) => {
          console.error("[chat] failed to release cancelled reservation", error);
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function estimateMessageTokens(content: ProviderMessage["content"]) {
  if (typeof content === "string") return approximateTokens(content);
  return content.reduce((sum, part) => sum + (part.type === "text" ? approximateTokens(part.text) : 1_024), 0);
}
