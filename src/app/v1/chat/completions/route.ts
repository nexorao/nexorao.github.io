import { z } from "zod";
import { apiKeyMonthlyUsage, authenticateApiKey } from "@/lib/api-keys";
import { ApiCompletionError, completeApiChat, streamApiCompletion } from "@/lib/api/completion";
import { rateLimitAsync } from "@/lib/rate-limit";
import { PayloadTooLargeError, readRequestTextLimited } from "@/lib/http";

const schema = z.object({
  model: z.string().trim().min(2).max(160),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(32_000),
  })).min(1).max(40),
  max_tokens: z.number().int().positive().max(8192).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional().default(false),
});

function error(message: string, status: number) {
  const type = status === 401 ? "authentication_error" : status === 429 ? "rate_limit_error" : status === 402 ? "insufficient_quota" : "invalid_request_error";
  const headers = new Headers({ "cache-control": "no-store" });
  if (status === 401) headers.set("www-authenticate", "Bearer");
  return Response.json({ error: { message, type, code: status } }, {
    status,
    headers,
  });
}

function sse(data: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  if (!token) return error("A NEXORA API key is required in the Authorization header.", 401);
  const key = await authenticateApiKey(token);
  if (!key) return error("The API key is invalid, expired or revoked.", 401);

  const limit = await rateLimitAsync(`api-key:${key.id}`, 60, 60_000);
  if (!limit.allowed) {
    return Response.json({ error: { message: "Rate limit exceeded.", type: "rate_limit_error", code: 429 } }, {
      status: 429, headers: { "retry-after": String(limit.retryAfterSeconds), "cache-control": "no-store" },
    });
  }
  if (key.monthlyLimitCredits !== null && await apiKeyMonthlyUsage(key.id) >= key.monthlyLimitCredits) {
    return error("This API key has reached its monthly credit limit.", 429);
  }

  let raw: unknown;
  try { raw = JSON.parse(await readRequestTextLimited(request, 64_000)); }
  catch (cause) { return error(cause instanceof PayloadTooLargeError ? cause.message : "Request body must be valid JSON.", cause instanceof PayloadTooLargeError ? 413 : 400); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid chat completion request.", 400);
  const system = parsed.data.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n") || undefined;
  const messages = parsed.data.messages.filter((message) => message.role !== "system").map(({ role, content }) => ({ role: role as "user" | "assistant", content }));
  if (!messages.length) return error("Include at least one user or assistant message.", 400);
  const input = {
    userId: key.userId,
    apiKeyId: key.id,
    model: parsed.data.model,
    messages,
    system,
    maxOutputTokens: parsed.data.max_tokens,
    temperature: parsed.data.temperature,
    monthlyLimitCredits: key.monthlyLimitCredits,
    signal: request.signal,
  };

  if (!parsed.data.stream) {
    try {
      const completion = await completeApiChat(input);
      return Response.json({
        id: completion.id,
        object: "chat.completion",
        created: completion.created,
        model: completion.model,
        choices: [{ index: 0, message: { role: "assistant", content: completion.text }, finish_reason: completion.finishReason ?? "stop" }],
        usage: {
          prompt_tokens: completion.usage.inputTokens,
          completion_tokens: completion.usage.outputTokens,
          total_tokens: completion.usage.inputTokens + completion.usage.outputTokens,
        },
        nexora: { credits_charged: completion.creditsCharged },
      }, { headers: { "cache-control": "no-store" } });
    } catch (cause) {
      if (cause instanceof ApiCompletionError) return error(cause.message, cause.status);
      console.error("[api] completion failed", cause);
      return error("The model provider could not complete this request.", 502);
    }
  }

  const abort = new AbortController();
  const abortFromRequest = () => abort.abort();
  request.signal.addEventListener("abort", abortFromRequest, { once: true });
  const iterator = streamApiCompletion({ ...input, signal: abort.signal });
  let activeResponse: { id: string; model: string; created: number } | null = null;
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of iterator) {
          if (event.type === "started") {
            activeResponse = { id: event.id, model: event.model, created: event.created };
            controller.enqueue(sse({ id: event.id, object: "chat.completion.chunk", created: event.created, model: event.model, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }));
          } else if (event.type === "delta") {
            controller.enqueue(sse({ ...activeResponse, object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: event.text }, finish_reason: null }] }));
          } else {
            controller.enqueue(sse({ id: event.id, object: "chat.completion.chunk", created: event.created, model: event.model, choices: [{ index: 0, delta: {}, finish_reason: event.finishReason ?? "stop" }], usage: { prompt_tokens: event.usage.inputTokens, completion_tokens: event.usage.outputTokens, total_tokens: event.usage.inputTokens + event.usage.outputTokens }, nexora: { credits_charged: event.creditsCharged } }));
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          }
        }
        controller.close();
      } catch (cause) {
        const message = cause instanceof ApiCompletionError ? cause.message : "The model provider could not complete this request.";
        controller.enqueue(sse({ error: { message, type: cause instanceof ApiCompletionError ? "invalid_request_error" : "server_error" } }));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      } finally {
        request.signal.removeEventListener("abort", abortFromRequest);
      }
    },
    async cancel() {
      abort.abort();
      await iterator.return(undefined);
      request.signal.removeEventListener("abort", abortFromRequest);
    },
  });
  return new Response(responseStream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
