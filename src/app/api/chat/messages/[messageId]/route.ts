import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";

export async function DELETE(_request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError && error.code === "forbidden" ? "Forbidden." : "Sign in to continue." }, { status: 401 });
  }
  const { messageId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return Response.json({ error: "Message not found." }, { status: 404 });
  const [owned] = await db.select({ id: chatMessages.id }).from(chatMessages)
    .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
    .where(and(
    eq(chatMessages.id, messageId),
    eq(chatConversations.userId, user.id),
  )).limit(1);
  if (!owned) return Response.json({ error: "Message not found." }, { status: 404 });
  await db.delete(chatMessages).where(eq(chatMessages.id, messageId));
  return Response.json({ ok: true });
}
