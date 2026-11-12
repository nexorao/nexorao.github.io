import { modelRefs, parseEventStream, providerFetch, providerJson, providerStreamFetch, providerUrl, responseRecord, safeUsage } from "./common";
import { ProviderApiError, type CompletionResult, type ProviderAdapter } from "./types";

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",

  async probe(config) {
    const response = await providerFetch(
      providerUrl(config, "/v1beta/models?pageSize=100"),
      { headers: geminiHeaders(config.apiKey) },
      config.apiKey,
    );
    return { models: modelRefs(await providerJson(response, config.apiKey)) };
  },

  async complete(config, request) {
    const transcript = request.messages
      .map(({ role, content }) => `${role === "assistant" ? "Assistant" : "User"}: ${content}`)
      .join("\n\n");
    const body: Record<string, unknown> = {
      model: request.model,
      input: transcript,
      generation_config: {
        max_output_tokens: request.maxOutputTokens,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.topP === undefined ? {} : { top_p: request.topP }),
      },
      store: false,
    };
    if (request.system) body.system_instruction = request.system;

    const response = await providerFetch(
      providerUrl(config, "/v1beta/interactions"),
      {
        method: "POST",
        headers: { ...geminiHeaders(config.apiKey), "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      config.apiKey,
      60_000,
    );
    const payload = responseRecord(await providerJson(response, config.apiKey));
    const usage = responseRecord(payload.usage);
    const text = extractInteractionText(payload);
    if (!text) throw new ProviderApiError("The provider returned no text content.", response.status);

    return {
      text,
      usage: {
        inputTokens: safeUsage(usage.total_input_tokens),
        outputTokens: safeUsage(usage.total_output_tokens),
        cachedInputTokens: safeUsage(usage.total_cached_tokens),
        reasoningOutputTokens: safeUsage(usage.total_thought_tokens),
      },
      requestId: typeof payload.id === "string" ? payload.id : response.headers.get("x-request-id"),
      finishReason: typeof payload.status === "string" ? payload.status : null,
    } satisfies CompletionResult;
  },

  async *stream(config, request, signal) {
    const transcript = request.messages
      .map(({ role, content }) => `${role === "assistant" ? "Assistant" : "User"}: ${content}`)
      .join("\n\n");
    const body: Record<string, unknown> = {
      model: request.model,
      input: transcript,
      generation_config: {
        max_output_tokens: request.maxOutputTokens,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.topP === undefined ? {} : { top_p: request.topP }),
      },
      store: false,
      stream: true,
    };
    if (request.system) body.system_instruction = request.system;
    const response = await providerStreamFetch(
      providerUrl(config, "/v1beta/interactions"),
      {
        method: "POST",
        headers: { ...geminiHeaders(config.apiKey), "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(body),
      },
      config.apiKey,
      signal,
    );
    let requestId = response.headers.get("x-request-id");
    let usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0 };
    let finishReason: string | null = null;
    let completed = false;
    for await (const frame of parseEventStream(response)) {
      let payload: Record<string, unknown>;
      try {
        payload = responseRecord(JSON.parse(frame.data));
      } catch {
        continue;
      }
      const eventType = typeof payload.event_type === "string" ? payload.event_type : frame.event;
      if (eventType === "interaction.created") {
        const interaction = responseRecord(payload.interaction);
        requestId = typeof interaction.id === "string" ? interaction.id : requestId;
      } else if (eventType === "step.delta") {
        const delta = responseRecord(payload.delta);
        if (delta.type === "text" && typeof delta.text === "string" && delta.text) {
          yield { type: "delta", text: delta.text };
        }
      } else if (eventType === "interaction.completed") {
        const interaction = responseRecord(payload.interaction);
        const rawUsage = responseRecord(interaction.usage);
        usage = {
          inputTokens: safeUsage(rawUsage.total_input_tokens, safeUsage(rawUsage.prompt_tokens)),
          outputTokens: safeUsage(rawUsage.total_output_tokens, safeUsage(rawUsage.completion_tokens)),
          cachedInputTokens: safeUsage(rawUsage.total_cached_tokens),
          reasoningOutputTokens: safeUsage(rawUsage.total_thought_tokens),
        };
        requestId = typeof interaction.id === "string" ? interaction.id : requestId;
        finishReason = typeof interaction.status === "string" ? interaction.status : null;
        if (finishReason !== "completed") {
          throw new ProviderApiError("The provider did not complete the requested response.");
        }
        completed = true;
        yield { type: "completed", usage, requestId, finishReason };
      } else if (eventType === "error") {
        throw new ProviderApiError("The provider failed while streaming a response.");
      }
    }
    if (!completed) throw new ProviderApiError("The provider stream ended before completion.");
  },
};

function geminiHeaders(apiKey: string): HeadersInit {
  return { "x-goog-api-key": apiKey };
}

function extractInteractionText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .map((item) => {
      const row = responseRecord(item);
      return typeof row.text === "string" ? row.text : "";
    })
    .filter(Boolean)
    .join("");
}
