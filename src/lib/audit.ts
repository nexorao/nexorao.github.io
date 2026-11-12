import { db } from "../db";
import { auditLogs } from "../db/schema";
import { desc, eq, and, type SQL } from "drizzle-orm";

/**
 * Audit trail (spec §15/§16): every sensitive action — auth events, admin
 * operations, wallet grants — writes an append-only row here.
 */
export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    ip: input.ip ?? null,
  });
}

export async function listAudit(options: { limit?: number; filter?: SQL } = {}) {
  const limit = Math.min(options.limit ?? 50, 200);
  const query = db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  if (options.filter) return query.where(options.filter);
  return query;
}

export async function listAuditForEntity(entityType: string, entityId: string) {
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);
}
