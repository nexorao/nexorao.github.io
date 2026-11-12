import { AuthError, requireUser } from "@/lib/auth/session";
import { isAiChatEnabled, listChatModels } from "@/lib/chat/queries";

export async function GET() {
  try {
    const user = await requireUser();
    const models = await listChatModels(user.id);
    if (models.length === 0) {
      return Response.json({ error: "The model catalog is empty. Retry or contact support." }, { status: 503 });
    }
    return Response.json({ models, chatEnabled: isAiChatEnabled() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof AuthError ? 401 : 500;
    return Response.json({ error: status === 401 ? "Sign in to load the model catalog." : "The model catalog could not be loaded." }, { status });
  }
}
