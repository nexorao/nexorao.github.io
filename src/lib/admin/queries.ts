import { db } from "@/db";
import {
  auditLogs,
  creditReservations,
  subscriptions,
  users,
  walletBuckets,
  wallets,
} from "@/db/schema";
import { desc, eq, ilike, or, sql } from "drizzle-orm";

/** Admin-side aggregate queries (spec §15). Called from admin pages only. */

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  status: "active" | "suspended";
  emailVerified: boolean;
  totpEnabled: boolean;
  createdAt: Date;
  balance: number;
  planId: string | null;
  planStatus: string | null;
}

export async function listAdminUsers(query: string | undefined, limit = 50): Promise<AdminUserRow[]> {
  const base = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      totpEnabled: users.totpEnabled,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);

  const rows = query
    ? await base.where(or(ilike(users.email, `%${query}%`), ilike(users.name, `%${query}%`)))
    : await base;

  const balanceRows = await db
    .select({
      userId: wallets.userId,
      credits: sql<string>`COALESCE(SUM(${walletBuckets.credits}), 0)`,
    })
    .from(wallets)
    .leftJoin(walletBuckets, eq(walletBuckets.walletId, wallets.id))
    .groupBy(wallets.userId);
  const balances = new Map(balanceRows.map((r) => [r.userId, Number(r.credits)]));

  const subRows = await db
    .select({
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));
  const subs = new Map(subRows.map((r) => [r.userId, r]));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    status: r.status,
    emailVerified: r.emailVerifiedAt !== null,
    totpEnabled: r.totpEnabled,
    createdAt: r.createdAt,
    balance: balances.get(r.id) ?? 0,
    planId: subs.get(r.id)?.planId ?? null,
    planStatus: subs.get(r.id)?.status ?? null,
  }));
}

export interface AdminOverview {
  totalUsers: number;
  verifiedUsers: number;
  suspendedUsers: number;
  activeSubscriptions: number;
  /** Total credits outstanding across all wallets = platform liability. */
  creditsLiability: number;
  /** Credits locked in `held` reservations right now. */
  heldCredits: number;
}

export async function adminOverview(): Promise<AdminOverview> {
  const [[userRow], [verifiedRow], [suspendedRow], [subRow], [creditRow], [heldRow]] =
    await Promise.all([
      db.select({ n: sql<string>`COUNT(*)` }).from(users),
      db
        .select({ n: sql<string>`COUNT(*)` })
        .from(users)
        .where(sql`${users.emailVerifiedAt} IS NOT NULL`),
      db
        .select({ n: sql<string>`COUNT(*)` })
        .from(users)
        .where(eq(users.status, "suspended")),
      db
        .select({ n: sql<string>`COUNT(*)` })
        .from(subscriptions)
        .where(eq(subscriptions.status, "active")),
      db.select({ n: sql<string>`COALESCE(SUM(${walletBuckets.credits}), 0)` }).from(walletBuckets),
      db
        .select({
          n: sql<string>`COALESCE(SUM(${creditReservations.estimatedCredits}), 0)`,
        })
        .from(creditReservations)
        .where(eq(creditReservations.status, "held")),
    ]);

  return {
    totalUsers: Number(userRow.n),
    verifiedUsers: Number(verifiedRow.n),
    suspendedUsers: Number(suspendedRow.n),
    activeSubscriptions: Number(subRow.n),
    creditsLiability: Number(creditRow.n),
    heldCredits: Number(heldRow.n),
  };
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  actorEmail: string | null;
  createdAt: Date;
}

export async function listAuditWithActor(
  query: string | undefined,
  limit = 100,
): Promise<AuditRow[]> {
  const base = db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      actorEmail: users.email,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return query ? base.where(ilike(auditLogs.action, `%${query}%`)) : base;
}
