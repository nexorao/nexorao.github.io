export type ProviderAdapterId = "anthropic" | "openai" | "gemini" | "openai-compatible";

export interface ProviderConfig {
  slug: string;
  name: string;
  adapter: ProviderAdapterId;
  baseUrl: string;
  apiKey: string;
}

export interface ProviderMessage {
  role: "user" | "assistant";
  content: string | ProviderContentPart[];
}

export type ProviderContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string };

export interface CompletionRequest {
  model: string;
  messages: ProviderMessage[];
  system?: string;
  maxOutputTokens: number;
  temperature?: number;
  topP?: number;
}

export interface CompletionResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    reasoningOutputTokens: number;
  };
  requestId: string | null;
  finishReason: string | null;
}

export type ProviderStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "completed";
      usage: CompletionResult["usage"];
      requestId: string | null;
      finishReason: string | null;
    };

export interface ProviderModelRef {
  id: string;
  name: string;
}

export interface ProviderProbeResult {
  models: ProviderModelRef[];
}

export interface ProviderAdapter {
  readonly id: ProviderAdapterId;
  probe(config: ProviderConfig): Promise<ProviderProbeResult>;
  complete(config: ProviderConfig, request: CompletionRequest): Promise<CompletionResult>;
  stream(
    config: ProviderConfig,
    request: CompletionRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ProviderStreamEvent>;
}

export class ProviderApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "ProviderApiError";
  }
}
