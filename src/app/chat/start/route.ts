import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { AuthError, requireUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const requestedModel = request.nextUrl.searchParams.get("model");
  const modelId = requestedModel && /^[a-z0-9][a-z0-9._:/-]{0,159}$/i.test(requestedModel)
    ? requestedModel
    : null;
  const destination = modelId
    ? "/dashboard/chat?model=" + encodeURIComponent(modelId)
    : "/dashboard/chat";
  try {
    await requireUser();
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    if (error.code === "suspended") redirect("/login?suspended=1");
    redirect("/login?next=" + encodeURIComponent(destination));
  }
  redirect(destination);
}
