import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, userRoles, type User } from "@/db/schema";
import { generateToken, hashToken } from "@/lib/crypto/password";

/**
 * Session data-access layer (spec §16: server-side authz everywhere).
 *
 * With cacheComponents enabled, session reads are request-time data: pages
 * must call these helpers from inside a <Suspense> boundary (or from a
 * server action / route handler). `getCurrentUser` uses `use cache: private`
 * so the identity is deduped per request and prefetched per session without
 * being stored in a shared server cache.
 */

export const SESSION_COOKIE = "nx_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  status: User["status"];
  totpEnabled: boolean;
  isAdmin: boolean;
}

async function findSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

async function loadSessionUser(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      user: users,
      session: sessions,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date()),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  const isAdmin = await db
    .select({ roleName: userRoles.roleName })
    .from(userRoles)
    .where(and(eq(userRoles.userId, row.user.id), eq(userRoles.roleName, "admin")))
    .limit(1)
    .then((r) => r.length > 0);

  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    status: row.user.status,
    totpEnabled: row.user.totpEnabled,
    isAdmin,
  };
}

/**
 * Current user or null. `use cache: private` keeps the resolved identity
 * per-browser (never in a shared server cache) and lets the router prefetch
 * the authenticated shell. No DB hit at all for guests.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  // NOTE(demo branch): "use cache: private" / cacheLife removed — the static
  // export build runs with cacheComponents disabled, where the directive does
  // not compile. The per-request cached wrapper stays on the main branch.
  const token = await findSessionToken();
  if (!token) return null;
  return loadSessionUser(token);
}

/**
 * Require an authenticated, active user — redirect to login
 * otherwise. Call from server components behind <Suspense> only.
 */
export async function getCurrentUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status === "suspended") redirect("/login?suspended=1");
  return user;
}

/** For server actions and route handlers (always request-time, no caching). */
export async function requireUser(): Promise<SessionUser> {
  const token = await findSessionToken();
  if (!token) throw new AuthError("unauthenticated");
  const user = await loadSessionUser(token);
  if (!user) throw new AuthError("unauthenticated");
  if (user.status === "suspended") throw new AuthError("suspended");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new AuthError("forbidden");
  return user;
}

export class AuthError extends Error {
  constructor(public code: "unauthenticated" | "suspended" | "forbidden") {
    super(`Auth error: ${code}`);
    this.name = "AuthError";
  }
}

// ---------------------------------------------------------------------------
// Session lifecycle (called by the auth server actions)
// ---------------------------------------------------------------------------

export const SESSION_TTL_DAYS_FALLBACK = 30;

export async function createSession(userId: string): Promise<void> {
  const ttlDays = Number(process.env.SESSION_TTL_DAYS ?? SESSION_TTL_DAYS_FALLBACK);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const token = generateToken(32);

  const hdrs = await headers();
  await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent")?.slice(0, 400) ?? null,
    });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const token = await findSessionToken();
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Revoke every session for a user (password reset / admin suspend). */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Revoke every session except the caller's own (in-app password change /
 * 2FA change). No-op when called outside a request scope.
 */
export async function destroyOtherSessions(userId: string): Promise<void> {
  const token = await findSessionToken();
  await db.delete(sessions).where(
    and(
      eq(sessions.userId, userId),
      token ? ne(sessions.tokenHash, hashToken(token)) : undefined,
    ),
  );
}
