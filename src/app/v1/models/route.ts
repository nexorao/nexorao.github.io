import { authenticateApiKey } from "@/lib/api-keys";
import { listChatModels } from "@/lib/chat/queries";
import { rateLimitAsync } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!token) return Response.json({ error: { message: "A NEXORA API key is required.", type: "authentication_error" } }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  const key = await authenticateApiKey(token);
  if (!key) return Response.json({ error: { message: "The API key is invalid, expired or revoked.", type: "authentication_error" } }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  const limit = await rateLimitAsync(`api-key-models:${key.id}`, 120, 60_000);
  if (!limit.allowed) return Response.json({ error: { message: "Rate limit exceeded.", type: "rate_limit_error" } }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  const models = await listChatModels(key.userId);
  return Response.json({
    object: "list",
    data: models.map((model) => ({ id: model.id, object: "model", created: 0, owned_by: "nexora" })),
  }, { headers: { "cache-control": "no-store" } });
}
