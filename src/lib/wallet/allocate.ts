/**
 * Bucket allocation math — PURE, no database, fully unit-tested.
 *
 * The transactional wallet service (index.ts) locks the bucket rows and
 * applies what these functions compute; keeping the math here makes the
 * consumption rules (spec §6) testable without Postgres.
 */
import type { BucketType } from "@/db/schema";

export interface BucketView {
  id: string;
  type: BucketType;
  credits: number;
  expiresAt: Date | null;
  createdAt: Date;
}

const TYPE_ORDER: Record<string, number> = {
  daily_free: 0,
  promotional: 1,
  subscription: 2,
  purchased: 3,
};

/** Spec §6 default; overridden by the `consumptionOrder` setting. */
export const DEFAULT_CONSUMPTION_ORDER = ["daily_free", "promotional", "subscription", "purchased"];

function typeRank(type: string, order: string[]): number {
  const idx = order.indexOf(type);
  return idx === -1 ? TYPE_ORDER[type] ?? 99 : idx;
}

/** daily_free → promotional (nearest expiry first) → subscription → purchased. */
export function sortBucketsForDebit(buckets: BucketView[], order: string[]): BucketView[] {
  return [...buckets]
    .filter((b) => b.credits > 0)
    .sort((a, b) => {
      const byType = typeRank(a.type, order) - typeRank(b.type, order);
      if (byType !== 0) return byType;
      // Within a type: expiring soonest first; never-expiring last.
      if (a.expiresAt && b.expiresAt) return a.expiresAt.getTime() - b.expiresAt.getTime();
      if (a.expiresAt) return -1;
      if (b.expiresAt) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

export interface DebitAllocation {
  bucketId: string;
  bucketType: BucketType;
  amount: number;
}

export interface DebitPlan {
  allocations: DebitAllocation[];
  /** What is still missing after the best possible allocation (0 on success). */
  shortfall: number;
}

/**
 * Plan a debit of `amount` credits across buckets in consumption order.
 * Falls back to the default order for unknown types so a misconfigured
 * setting can never strand credits in an unconsumable bucket.
 */
export function planDebit(
  buckets: BucketView[],
  amount: number,
  order: string[] = DEFAULT_CONSUMPTION_ORDER,
): DebitPlan {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("Debit amount must be a non-negative integer");
  }
  const sorted = sortBucketsForDebit(buckets, order);
  const allocations: DebitAllocation[] = [];
  let remaining = amount;
  for (const bucket of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(bucket.credits, remaining);
    allocations.push({ bucketId: bucket.id, bucketType: bucket.type, amount: take });
    remaining -= take;
  }
  return { allocations, shortfall: remaining };
}

export interface RefundPlan {
  allocations: DebitAllocation[];
  /**
   * When the originating buckets cannot absorb the full amount (e.g. a
   * bucket was deleted mid-flight), the remainder should land in a bucket
   * of this type — the lowest-priority type present, or null if none.
   */
  fallbackType: BucketType | null;
  fallbackAmount: number;
}

/**
 * Refund allocation: return credits to the buckets that paid, largest first.
 * If a bucket was deleted mid-flight (should never happen), the remainder is
 * reported as `fallbackAmount` for the service layer to place.
 */
export function planRefund(
  breakdown: { bucketId: string; amount: number }[],
  amount: number,
  buckets: BucketView[],
  order: string[] = DEFAULT_CONSUMPTION_ORDER,
): RefundPlan {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("Refund amount must be a non-negative integer");
  }
  const byId = new Map(buckets.map((b) => [b.id, b]));
  const allocations: DebitAllocation[] = [];
  let remaining = amount;

  // First: back to the originating buckets, largest contribution first.
  for (const entry of [...breakdown].sort((a, b) => b.amount - a.amount)) {
    if (remaining <= 0) break;
    const bucket = byId.get(entry.bucketId);
    if (!bucket) continue;
    const give = Math.min(entry.amount, remaining);
    if (give <= 0) continue;
    allocations.push({ bucketId: bucket.id, bucketType: bucket.type, amount: give });
    remaining -= give;
  }

  if (remaining > 0) {
    // Lowest-priority type present (last in consumption order).
    const presentTypes = new Set(buckets.map((b) => b.type));
    const fallbackType =
      [...order].reverse().find((t) => presentTypes.has(t as BucketType)) ?? null;
    return { allocations, fallbackType: fallbackType as BucketType | null, fallbackAmount: remaining };
  }

  return { allocations, fallbackType: null, fallbackAmount: 0 };
}
