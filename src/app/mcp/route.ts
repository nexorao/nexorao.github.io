import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { apiKeyMonthlyUsage, authenticateApiKey } from "@/lib/api-keys";
import { ApiCompletionError, completeApiChat } from "@/lib/api/completion";
import { listChatModels } from "@/lib/chat/queries";
import { rateLimitAsync } from "@/lib/rate-limit";
import { PayloadTooLargeError, readRequestTextLimited } from "@/lib/http";

const PROTOCOL_VERSION = "2025-11-25";
const toolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
});

function result(id: unknown, payload: unknown, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, result: payload }, {
    status,
    headers: { "cache-control": "no-store", "mcp-protocol-version": PROTOCOL_VERSION },
  });
}

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, {
    status,
    headers: { "cache-control": "no-store", "mcp-protocol-version": PROTOCOL_VERSION },
  });
}

function textContent(value: unknown) {
  return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }];
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  if (!token) return Response.json({ error: "A NEXORA API key is required." }, { status: 401, headers: { "www-authenticate": "Bearer", "cache-control": "no-store" } });
  const key = await authenticateApiKey(token);
  if (!key) return Response.json({ error: "Invalid or revoked API key." }, { status: 401, headers: { "www-authenticate": "Bearer", "cache-control": "no-store" } });
  const rate = await rateLimitAsync(`mcp:${key.id}`, 60, 60_000);
  if (!rate.allowed) return Response.json({ error: "Rate limit exceeded." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });

  const protocol = request.headers.get("mcp-protocol-version");
  if (protocol && protocol !== PROTOCOL_VERSION && protocol !== "2025-06-18" && protocol !== "2025-03-26") {
    return Response.json({ error: `Unsupported MCP protocol version. Use ${PROTOCOL_VERSION}.` }, { status: 400 });
  }
  let raw: unknown;
  try { raw = JSON.parse(await readRequestTextLimited(request, 64_000)); }
  catch (cause) { return Response.json({ error: cause instanceof PayloadTooLargeError ? cause.message : "Expected a JSON-RPC request." }, { status: cause instanceof PayloadTooLargeError ? 413 : 400 }); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return Response.json({ error: "Expected a JSON-RPC object." }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const id = body.id;
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") return rpcError(id, -32600, "Invalid Request");
  const params = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params as Record<string, unknown> : {};

  if (body.method === "notifications/initialized" || body.method === "notifications/cancelled") return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  if (body.method === "ping") return result(id, {});
  if (body.method === "initialize") return result(id, {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "nexora-ai", version: "1.0.0" },
    instructions: "NEXORA model calls consume credits from the API key owner's wallet.",
  });
  if (body.method === "tools/list") return result(id, { tools: [
    { name: "list_models", description: "List models available to this API key owner's current plan.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "get_usage", description: "Show request and credit usage for this API key in the current month.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "chat_completion", description: "Generate a response with an available NEXORA model. This is billable from the owner's wallet.", inputSchema: {
      type: "object", required: ["model", "messages"], additionalProperties: false,
      properties: {
        model: { type: "string" },
        messages: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", required: ["role", "content"], properties: { role: { type: "string", enum: ["system", "user", "assistant"] }, content: { type: "string" } } } },
        max_output_tokens: { type: "integer", minimum: 1, maximum: 8192 },
      },
    } },
  ] });

  if (body.method !== "tools/call") return rpcError(id, -32601, "Method not found");
  const parsed = toolCallSchema.safeParse(params);
  if (!parsed.success) return rpcError(id, -32602, "Invalid tool call parameters");
  const { name, arguments: args } = parsed.data;
  try {
    if (name === "list_models") {
      return result(id, { content: textContent(await listChatModels(key.userId)) });
    }
    if (name === "get_usage") {
      const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
      const [row] = await db.select({
        requests: sql<string>`count(*) filter (where ${chatMessages.status} in ('complete', 'failed'))`,
        failures: sql<string>`count(*) filter (where ${chatMessages.status} = 'failed')`,
      }).from(chatMessages).where(and(eq(chatMessages.apiKeyId, key.id), gte(chatMessages.createdAt, monthStart)));
      return result(id, { content: textContent({ requests: Number(row.requests), failures: Number(row.failures), credits: await apiKeyMonthlyUsage(key.id), monthlyLimitCredits: key.monthlyLimitCredits }) });
    }
    if (name === "chat_completion") {
      const argsSchema = z.object({
        model: z.string().min(2).max(160),
        messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().max(32_000) })).min(1).max(40),
        max_output_tokens: z.number().int().positive().max(8192).optional(),
      });
      const values = argsSchema.safeParse(args);
      if (!values.success) return rpcError(id, -32602, values.error.issues[0]?.message ?? "Invalid chat arguments");
      const system = values.data.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n") || undefined;
      const messages = values.data.messages.filter((message) => message.role !== "system").map(({ role, content }) => ({ role: role as "user" | "assistant", content }));
      if (!messages.length) return rpcError(id, -32602, "Include at least one user or assistant message");
      const completion = await completeApiChat({
        userId: key.userId, apiKeyId: key.id, monthlyLimitCredits: key.monthlyLimitCredits,
        model: values.data.model, messages, system, maxOutputTokens: values.data.max_output_tokens,
      });
      return result(id, { content: textContent(completion.text), isError: false, structuredContent: {
        model: completion.model, usage: completion.usage, creditsCharged: completion.creditsCharged,
      } });
    }
    return rpcError(id, -32602, `Unknown tool: ${name}`);
  } catch (cause) {
    if (cause instanceof ApiCompletionError) return result(id, { content: textContent(cause.message), isError: true });
    console.error("[mcp] tool failed", cause);
    return result(id, { content: textContent("The tool could not complete the request."), isError: true });
  }
}

export async function GET() {
  return Response.json({ error: "NEXORA MCP uses Streamable HTTP POST. GET event streams are not enabled." }, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
}
