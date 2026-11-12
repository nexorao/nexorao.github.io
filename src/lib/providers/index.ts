import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import { openAiAdapter, openAiCompatibleAdapter } from "./openai";
import { ProviderApiError, type ProviderAdapter, type ProviderAdapterId } from "./types";

const ADAPTERS: Record<ProviderAdapterId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openAiAdapter,
  gemini: geminiAdapter,
  "openai-compatible": openAiCompatibleAdapter,
};

export function getProviderAdapter(adapterId: string): ProviderAdapter {
  const adapter = ADAPTERS[adapterId as ProviderAdapterId];
  if (!adapter) throw new ProviderApiError(`Unsupported provider adapter: ${adapterId}`);
  return adapter;
}

export { ProviderApiError } from "./types";
export type {
  CompletionRequest,
  CompletionResult,
  ProviderAdapterId,
  ProviderConfig,
  ProviderMessage,
  ProviderModelRef,
  ProviderProbeResult,
  ProviderStreamEvent,
} from "./types";
