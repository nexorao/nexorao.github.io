import { contentText, modelRefs, parseEventStream, providerFetch, providerJson, providerStreamFetch, providerUrl, responseRecord, safeUsage } from "./common";
import { ProviderApiError, type CompletionResult, type ProviderAdapter } from "./types";

const ANTHROPIC_VERSION = "2026-10-21";

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",

  async probe(config) {
    const response = await providerFetch(
      providerUrl(config, "/v1/models?limit=100"),
      { headers: anthropicHeaders(config.apiKey) },
      config.apiKey,
    );
    return { models: modelRefs(await providerJson(response, config.apiKey)) };
  },

  async complete(config, request) {
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxOutputTokens,
      messages: request.messages.map(({ role, content }) => ({ role, content: anthropicContent(content) })),
    };
    if (request.system) body.system = request.system;
    if (request.topP !== undefined && request.topP !== 1) body.top_p = request.topP;
    else if (request.temperature !== undefined) body.temperature = request.temperature;

    const response = await providerFetch(
      providerUrl(config, "/v1/messages"),
      {
        method: "POST",
        headers: { ...anthropicHeaders(config.apiKey), "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      config.apiKey,
      60_000,
    );
    const payload = responseRecord(await providerJson(response, config.apiKey));
    const usage = responseRecord(payload.usage);
    const content = contentText(payload.content);
    if (!content) throw new ProviderApiError("The provider returned no text content.", response.status);

    return {
      text: content,
      usage: {
        inputTokens: safeUsage(usage.input_tokens),
        outputTokens: safeUsage(usage.output_tokens),
        cachedInputTokens: safeUsage(usage.cache_read_input_tokens),
        reasoningOutputTokens: 0,
      },
      requestId: typeof payload.id === "string" ? payload.id : response.headers.get("request-id"),
      finishReason: typeof payload.stop_reason === "string" ? payload.stop_reason : null,
    } satisfies CompletionResult;
  },

  async *stream(config, request, signal) {
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxOutputTokens,
      messages: request.messages.map(({ role, content }) => ({ role, content: anthropicContent(content) })),
      stream: true,
    };
    if (request.system) body.system = request.system;
    if (request.topP !== undefined && request.topP !== 1) body.top_p = request.topP;
    else if (request.temperature !== undefined) body.temperature = request.temperature;
    const response = await providerStreamFetch(
      providerUrl(config, "/v1/messages"),
      {
        method: "POST",
        headers: { ...anthropicHeaders(config.apiKey), "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(body),
      },
      config.apiKey,
      signal,
    );

    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInputTokens = 0;
    let requestId = response.headers.get("request-id");
    let finishReason: string | null = null;
    let completed = false;
    for await (const frame of parseEventStream(response)) {
      let payload: Record<string, unknown>;
      try {
        payload = responseRecord(JSON.parse(frame.data));
      } catch {
        continue;
      }
      const eventType = typeof payload.type === "string" ? payload.type : frame.event;
      if (eventType === "message_start") {
        const message = responseRecord(payload.message);
        const usage = responseRecord(message.usage);
        inputTokens = safeUsage(usage.input_tokens);
        cachedInputTokens = safeUsage(usage.cache_read_input_tokens);
        requestId = typeof message.id === "string" ? message.id : requestId;
      } else if (eventType === "content_block_delta") {
        const delta = responseRecord(payload.delta);
        if (delta.type === "text_delta" && typeof delta.text === "string" && delta.text) {
          yield { type: "delta", text: delta.text };
        }
      } else if (eventType === "message_delta") {
        const usage = responseRecord(payload.usage);
        const delta = responseRecord(payload.delta);
        outputTokens = safeUsage(usage.output_tokens, outputTokens);
        finishReason = typeof delta.stop_reason === "string" ? delta.stop_reason : finishReason;
      } else if (eventType === "error") {
        throw new ProviderApiError("The provider failed while streaming a response.");
      } else if (eventType === "message_stop") {
        completed = true;
        yield {
          type: "completed",
          usage: { inputTokens, outputTokens, cachedInputTokens, reasoningOutputTokens: 0 },
          requestId,
          finishReason,
        };
      }
    }
    if (!completed) throw new ProviderApiError("The provider stream ended before completion.");
  },
};

function anthropicHeaders(apiKey: string): HeadersInit {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

function anthropicContent(content: import("./types").ProviderMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((part) => part.type === "text"
    ? { type: "text", text: part.text }
    : { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } });
}
