import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { AuthError, requireUser } from "@/lib/auth/session";
import { currencyMinorDigits } from "@/lib/currency";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try { user = await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to view this order." : "Authentication required." }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Order not found." }, { status: 404 });
  const [order] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, user.id))).limit(1);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
  const metadata = order.metadata && typeof order.metadata === "object" ? order.metadata as Record<string, unknown> : {};
  const expiresAt = typeof metadata.expiresAt === "string" ? metadata.expiresAt : null;
  const isExpired = order.status === "created" && expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
  return Response.json({
    id: order.id,
    status: isExpired ? "expired" : order.status,
    baseInr: Number(metadata.baseInr ?? 0),
    amount: order.amountPaise / (10 ** currencyMinorDigits(order.currency)),
    currency: order.currency,
    creditUsd: Number(metadata.creditUsd ?? 0),
    reference: typeof metadata.displayReference === "string" ? metadata.displayReference : order.reference,
    expiresAt,
    reviewReason: typeof metadata.reviewReason === "string" ? metadata.reviewReason : null,
  }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try { user = await requireUser(); } catch {
    return Response.json({ error: new AuthError("unauthenticated").message }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Order not found." }, { status: 404 });
  const [cancelled] = await db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(and(
    eq(payments.id, id), eq(payments.userId, user.id), eq(payments.status, "created"),
  )).returning({ id: payments.id });
  return Response.json({ ok: true, cancelled: Boolean(cancelled) });
}
