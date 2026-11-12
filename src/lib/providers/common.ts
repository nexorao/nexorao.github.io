import { ProviderApiError, type ProviderConfig, type ProviderModelRef } from "./types";

const ALLOWED_HOSTS: Record<ProviderConfig["adapter"], string[]> = {
  anthropic: ["api.anthropic.com"],
  openai: ["api.openai.com"],
  gemini: ["generativelanguage.googleapis.com"],
  "openai-compatible": ["openrouter.ai", "openrouter.com"],
};

export function providerUrl(config: ProviderConfig, endpoint: string): URL {
  const root = new URL(config.baseUrl);
  const allowedHosts = ALLOWED_HOSTS[config.adapter];
  if (
    root.protocol !== "https:" ||
    !allowedHosts.includes(root.hostname.toLowerCase()) ||
    root.username ||
    root.password ||
    root.search ||
    root.hash ||
    (root.port && root.port !== "443")
  ) {
    throw new ProviderApiError("Provider URL is not an approved secure endpoint.");
  }

  const basePath = root.pathname.replace(/\/+$/, "");
  const suffix = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return new URL(`${basePath}${suffix}`, root.origin);
}

export async function providerFetch(
  url: URL,
  init: RequestInit,
  apiKey: string,
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderApiError("The provider did not respond in time.");
    }
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new ProviderApiError(redact(message, apiKey));
  } finally {
    clearTimeout(timeout);
  }
}

export async function providerStreamFetch(
  url: URL,
  init: RequestInit,
  apiKey: string,
  signal?: AbortSignal,
  timeoutMs = 5 * 60_000,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
  try {
    const response = await fetch(url, {
      ...init,
      signal: requestSignal,
      cache: "no-store",
    });
    if (!response.ok) await providerJson(response, apiKey);
    if (!response.body) throw new ProviderApiError("The provider did not return a stream.");
    return response;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeoutSignal.aborted) {
      throw new ProviderApiError("The provider stream timed out.");
    }
    if (error instanceof ProviderApiError) throw error;
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new ProviderApiError(redact(message, apiKey));
  }
}

export async function* parseEventStream(
  response: Response,
): AsyncGenerator<{ event: string | null; data: string }> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseFrame = (frame: string) => {
    let event: string | null = null;
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
      if (field === "event") event = value;
      if (field === "data") data.push(value);
    }
    return data.length ? { event, data: data.join("\n") } : null;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
        buffer = buffer.slice(boundary + separator);
        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
        boundary = buffer.search(/\r?\n\r?\n/);
      }
      if (done) break;
    }
    const finalFrame = parseFrame(buffer);
    if (finalFrame) yield finalFrame;
  } finally {
    reader.releaseLock();
  }
}

export async function providerJson<T>(
  response: Response,
  apiKey: string,
): Promise<T> {
  const requestId =
    response.headers.get("request-id") ??
    response.headers.get("x-request-id") ??
    response.headers.get("anthropic-request-id");
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ProviderApiError(
      response.ok ? "The provider returned an unreadable response." : `Provider request failed (${response.status}).`,
      response.status,
      requestId,
    );
  }

  if (!response.ok) {
    const rawMessage = getErrorMessage(payload) ?? `Provider request failed (${response.status}).`;
    throw new ProviderApiError(redact(rawMessage, apiKey).slice(0, 320), response.status, requestId);
  }
  return payload as T;
}

export function modelRefs(payload: unknown): ProviderModelRef[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const rows = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : [];
  return rows
    .flatMap((row): ProviderModelRef[] => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const rawId = typeof item.id === "string" ? item.id : item.name;
      if (typeof rawId !== "string" || rawId.length === 0) return [];
      const id = rawId.replace(/^models\//, "");
      const displayName = typeof item.displayName === "string" ? item.displayName : id;
      return [{ id, name: displayName }];
    })
    .slice(0, 100);
}

export function safeUsage(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

export function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const block = item as Record<string, unknown>;
      return typeof block.text === "string" ? block.text : "";
    })
    .filter(Boolean)
    .join("");
}

export function responseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  const message = record.message;
  return typeof message === "string" ? message : null;
}

function redact(message: string, secret: string): string {
  if (!secret) return message;
  return message.split(secret).join("[redacted]");
}
