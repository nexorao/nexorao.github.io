import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";
import { rateLimitAsync } from "@/lib/rate-limit";

const schema = z.object({ utr: z.string().trim().regex(/^\d{12,20}$/, "Enter the 12–20 digit UPI reference number.") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to continue." : "Authentication required." }, { status: 401 });
  }
  const limit = await rateLimitAsync(`billing-utr:${user.id}`, 5, 60_000);
  if (!limit.allowed) return Response.json({ error: "Too many reference submissions. Try again shortly." }, { status: 429 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Order not found." }, { status: 404 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid UPI reference." }, { status: 400 });
  const [order] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, user.id))).limit(1);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "created") return Response.json({ error: "This order is no longer awaiting payment." }, { status: 409 });
  const metadata = order.metadata && typeof order.metadata === "object" ? order.metadata as Record<string, unknown> : {};
  await db.update(payments).set({ metadata: { ...metadata, utr: parsed.data.utr, utrSubmittedAt: new Date().toISOString() }, updatedAt: new Date() }).where(eq(payments.id, id));
  return Response.json({ ok: true, message: "Reference saved for review. It does not credit your balance by itself." });
}
