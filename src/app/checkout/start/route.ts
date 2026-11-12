import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

type Params = { kind: string | null; plan: string | null; pack: string | null; cycle: string | null };

function checkoutPath(params: Params) {
  const url = new URL("/dashboard/checkout", "https://nexorao.invalid");
  if (params.kind === "subscription" && params.plan && /^[a-z0-9_-]{1,64}$/i.test(params.plan)) {
    url.searchParams.set("kind", "subscription");
    url.searchParams.set("plan", params.plan);
    url.searchParams.set("cycle", params.cycle === "annual" ? "annual" : "monthly");
  } else if (params.kind === "topup" && params.pack && /^[a-z0-9_-]{1,64}$/i.test(params.pack)) {
    url.searchParams.set("kind", "topup");
    url.searchParams.set("pack", params.pack);
  } else {
    url.pathname = "/pricing";
  }
  return `${url.pathname}${url.search}`;
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const destination = checkoutPath({
    kind: incoming.searchParams.get("kind"),
    plan: incoming.searchParams.get("plan"),
    pack: incoming.searchParams.get("pack"),
    cycle: incoming.searchParams.get("cycle"),
  });
  const user = await getSessionUser();
  if (user?.status === "suspended") {
    const login = new URL("/login?suspended=1", request.url);
    return NextResponse.redirect(login);
  }
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", destination);
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL(destination, request.url));
}
