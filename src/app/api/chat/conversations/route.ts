import { db } from "@/db";
import { chatConversations } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function DELETE() {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError && error.code === "forbidden" ? "Forbidden." : "Sign in to continue." }, { status: 401 });
  }
  await db.delete(chatConversations).where(eq(chatConversations.userId, user.id));
  return Response.json({ ok: true });
}
