import { AuthError, requireUser } from "@/lib/auth/session";
import { getUserConversationMessages } from "@/lib/chat/queries";
import { db } from "@/db";
import { chatConversations } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthError && error.code === "forbidden" ? "Forbidden." : "Sign in to continue." },
      { status: error instanceof AuthError && error.code === "forbidden" ? 403 : 401 },
    );
  }
  const { conversationId } = await params;
  const messages = await getUserConversationMessages(user.id, conversationId);
  if (!messages) return Response.json({ error: "Conversation not found." }, { status: 404 });
  return Response.json({ messages }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError && error.code === "forbidden" ? "Forbidden." : "Sign in to continue." }, { status: 401 });
  }
  const { conversationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const [deleted] = await db.delete(chatConversations).where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, user.id))).returning({ id: chatConversations.id });
  return deleted ? Response.json({ ok: true }) : Response.json({ error: "Conversation not found." }, { status: 404 });
}
