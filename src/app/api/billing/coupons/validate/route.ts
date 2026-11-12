import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/session";

const schema = z.object({ code: z.string().trim().min(2).max(40) });

export async function POST(request: Request) {
  try { await requireUser(); } catch (error) {
    return Response.json({ error: error instanceof AuthError ? "Sign in to continue." : "Authentication required." }, { status: 401 });
  }
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Enter a coupon code." }, { status: 400 });
  return Response.json({ error: "This coupon is not active or has expired." }, { status: 404 });
}
