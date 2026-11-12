import { contentText, modelRefs, parseEventStream, providerFetch, providerJson, providerStreamFetch, providerUrl, responseRecord, safeUsage } from "./common";
import { ProviderApiError, type CompletionResult, type ProviderAdapter } from "./types";

export const openAiAdapter: ProviderAdapter = {
  id: "openai",

  async probe(config) {
    const response = await providerFetch(
      providerUrl(config, "/models"),
      { headers: bearerHeaders(config.apiKey) },
      config.apiKey,
    );
    return { models: modelRefs(await providerJson(response, config.apiKey)) };
  },

  async complete(config, request) {
    const input = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      ...request.messages.map(({ role, content }) => ({ role, content: responsesContent(content) })),
    ];
    const body = {
      model: request.model,
      input,
      max_output_tokens: request.maxOutputTokens,
      store: false,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.topP === undefined ? {} : { top_p: request.topP }),
    };
    const response = await providerFetch(
      providerUrl(config, "/responses"),
      {
        method: "POST",
        headers: { ...bearerHeaders(config.apiKey), "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      config.apiKey,
      60_000,
    );
    const payload = responseRecord(await providerJson(response, config.apiKey));
    const usage = responseRecord(payload.usage);
    const details = responseRecord(usage.input_tokens_details);
    const outputDetails = responseRecord(usage.output_tokens_details);
    const text = extractResponsesText(payload);
    if (!text) throw new ProviderApiError("The provider returned no text content.", response.status);

    return {
      text,
      usage: {
        inputTokens: safeUsage(usage.input_tokens),
        outputTokens: safeUsage(usage.output_tokens),
        cachedInputTokens: safeUsage(details.cached_tokens),
        reasoningOutputTokens: safeUsage(outputDetails.reasoning_tokens),
      },
      requestId: typeof payload.id === "string" ? payload.id : response.headers.get("x-request-id"),
      finishReason: typeof payload.status === "string" ? payload.status : null,
    } satisfies CompletionResult;
  },

  async *stream(config, request, signal) {
    const input = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      ...request.messages.map(({ role, content }) => ({ role, content: responsesContent(content) })),
    ];
    const response = await providerStreamFetch(
      providerUrl(config, "/responses"),
      {
        method: "POST",
        headers: { ...bearerHeaders(config.apiKey), "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          model: request.model,
          input,
          max_output_tokens: request.maxOutputTokens,
          store: false,
          stream: true,
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(request.topP === undefined ? {} : { top_p: request.topP }),
        }),
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
      const eventType = typeof payload.type === "string" ? payload.type : frame.event;
      if (eventType === "response.output_text.delta" && typeof payload.delta === "string") {
        yield { type: "delta", text: payload.delta };
      } else if (eventType === "response.completed" || eventType === "response.incomplete") {
        const result = responseRecord(payload.response);
        const resultUsage = responseRecord(result.usage);
        const inputDetails = responseRecord(resultUsage.input_tokens_details);
        const outputDetails = responseRecord(resultUsage.output_tokens_details);
        usage = {
          inputTokens: safeUsage(resultUsage.input_tokens),
          outputTokens: safeUsage(resultUsage.output_tokens),
          cachedInputTokens: safeUsage(inputDetails.cached_tokens),
          reasoningOutputTokens: safeUsage(outputDetails.reasoning_tokens),
        };
        requestId = typeof result.id === "string" ? result.id : requestId;
        finishReason = typeof result.status === "string" ? result.status : null;
        completed = true;
        yield { type: "completed", usage, requestId, finishReason };
      } else if (eventType === "response.failed" || eventType === "error") {
        throw new ProviderApiError("The provider failed while streaming a response.");
      }
    }
    if (!completed) throw new ProviderApiError("The provider stream ended before completion.");
  },
};

export const openAiCompatibleAdapter: ProviderAdapter = {
  id: "openai-compatible",

  async probe(config) {
    const response = await providerFetch(
      providerUrl(config, "/models"),
      { headers: bearerHeaders(config.apiKey) },
      config.apiKey,
    );
    return { models: modelRefs(await providerJson(response, config.apiKey)) };
  },

  async complete(config, request) {
    const messages = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      ...request.messages.map(({ role, content }) => ({ role, content: chatCompletionsContent(content) })),
    ];
    const response = await providerFetch(
      providerUrl(config, "/chat/completions"),
      {
        method: "POST",
        headers: { ...bearerHeaders(config.apiKey), "content-type": "application/json" },
        body: JSON.stringify({
          model: request.model,
          messages,
          max_tokens: request.maxOutputTokens,
          stream: false,
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(request.topP === undefined ? {} : { top_p: request.topP }),
        }),
      },
      config.apiKey,
      60_000,
    );
    const payload = responseRecord(await providerJson(response, config.apiKey));
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const choice = responseRecord(choices[0]);
    const message = responseRecord(choice.message);
    const usage = responseRecord(payload.usage);
    const promptDetails = responseRecord(usage.prompt_tokens_details);
    const completionDetails = responseRecord(usage.completion_tokens_details);
    const text = contentText(message.content);
    if (!text) throw new ProviderApiError("The provider returned no text content.", response.status);

    return {
      text,
      usage: {
        inputTokens: safeUsage(usage.prompt_tokens),
        outputTokens: safeUsage(usage.completion_tokens),
        cachedInputTokens: safeUsage(promptDetails.cached_tokens),
        reasoningOutputTokens: safeUsage(completionDetails.reasoning_tokens),
      },
      requestId: typeof payload.id === "string" ? payload.id : response.headers.get("x-request-id"),
      finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
    } satisfies CompletionResult;
  },

  async *stream(config, request, signal) {
    const messages = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      ...request.messages.map(({ role, content }) => ({ role, content: chatCompletionsContent(content) })),
    ];
    const response = await providerStreamFetch(
      providerUrl(config, "/chat/completions"),
      {
        method: "POST",
        headers: { ...bearerHeaders(config.apiKey), "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          model: request.model,
          messages,
          max_tokens: request.maxOutputTokens,
          stream: true,
          stream_options: { include_usage: true },
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(request.topP === undefined ? {} : { top_p: request.topP }),
        }),
      },
      config.apiKey,
      signal,
    );
    let requestId = response.headers.get("x-request-id");
    let usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0 };
    let finishReason: string | null = null;
    let completed = false;
    for await (const frame of parseEventStream(response)) {
      if (frame.data === "[DONE]") {
        completed = true;
        yield { type: "completed", usage, requestId, finishReason };
        continue;
      }
      let payload: Record<string, unknown>;
      try {
        payload = responseRecord(JSON.parse(frame.data));
      } catch {
        continue;
      }
      requestId = typeof payload.id === "string" ? payload.id : requestId;
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const choice = responseRecord(choices[0]);
      const delta = responseRecord(choice.delta);
      if (typeof delta.content === "string" && delta.content) {
        yield { type: "delta", text: delta.content };
      }
      if (typeof choice.finish_reason === "string") finishReason = choice.finish_reason;
      const rawUsage = responseRecord(payload.usage);
      if (Object.keys(rawUsage).length) {
        const promptDetails = responseRecord(rawUsage.prompt_tokens_details);
        const completionDetails = responseRecord(rawUsage.completion_tokens_details);
        usage = {
          inputTokens: safeUsage(rawUsage.prompt_tokens),
          outputTokens: safeUsage(rawUsage.completion_tokens),
          cachedInputTokens: safeUsage(promptDetails.cached_tokens),
          reasoningOutputTokens: safeUsage(completionDetails.reasoning_tokens),
        };
      }
    }
    if (!completed) throw new ProviderApiError("The provider stream ended before completion.");
  },
};

function bearerHeaders(apiKey: string): HeadersInit {
  return { authorization: `Bearer ${apiKey}` };
}

function responsesContent(content: import("./types").ProviderMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((part) => part.type === "text"
    ? { type: "input_text", text: part.text }
    : { type: "input_image", image_url: `data:${part.mediaType};base64,${part.data}` });
}

function chatCompletionsContent(content: import("./types").ProviderMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((part) => part.type === "text"
    ? { type: "text", text: part.text }
    : { type: "image_url", image_url: { url: `data:${part.mediaType};base64,${part.data}` } });
}

function extractResponsesText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return "";
  return payload.output
    .flatMap((item) => {
      const row = responseRecord(item);
      return row.type === "message" && Array.isArray(row.content) ? row.content : [];
    })
    .map((item) => {
      const row = responseRecord(item);
      return row.type === "output_text" && typeof row.text === "string" ? row.text : "";
    })
    .filter(Boolean)
    .join("");
}
