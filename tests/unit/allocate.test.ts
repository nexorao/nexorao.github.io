import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSUMPTION_ORDER,
  planDebit,
  planRefund,
  sortBucketsForDebit,
  type BucketView,
} from "@/lib/wallet/allocate";

function bucket(
  id: string,
  type: BucketView["type"],
  credits: number,
  expiresAt: Date | null = null,
): BucketView {
  return { id, type, credits, expiresAt, createdAt: new Date(0) };
}

describe("sortBucketsForDebit", () => {
  it("orders daily_free → promotional → subscription → purchased", () => {
    const sorted = sortBucketsForDebit(
      [
        bucket("p", "purchased", 10),
        bucket("s", "subscription", 10),
        bucket("pr", "promotional", 10),
        bucket("d", "daily_free", 10),
      ],
      DEFAULT_CONSUMPTION_ORDER,
    );
    expect(sorted.map((b) => b.id)).toEqual(["d", "pr", "s", "p"]);
  });

  it("puts expiring-soonest first within a type", () => {
    const soon = new Date("2026-11-12T00:00:00Z");
    const later = new Date("2026-12-01T00:00:00Z");
    const sorted = sortBucketsForDebit(
      [bucket("later", "promotional", 10, later), bucket("soon", "promotional", 10, soon)],
      DEFAULT_CONSUMPTION_ORDER,
    );
    expect(sorted.map((b) => b.id)).toEqual(["soon", "later"]);
  });
});

describe("planDebit", () => {
  const buckets = [
    bucket("purchased", "purchased", 100),
    bucket("daily", "daily_free", 50),
    bucket("promo-soon", "promotional", 30, new Date("2026-11-12T00:00:00Z")),
    bucket("promo-later", "promotional", 20, new Date("2026-12-01T00:00:00Z")),
  ];

  it("consumes in configured order and never splits a bucket twice", () => {
    const plan = planDebit(buckets, 95);
    expect(plan.shortfall).toBe(0);
    expect(plan.allocations).toEqual([
      { bucketId: "daily", bucketType: "daily_free", amount: 50 },
      { bucketId: "promo-soon", bucketType: "promotional", amount: 30 },
      { bucketId: "promo-later", bucketType: "promotional", amount: 15 },
    ]);
  });

  it("reports shortfall without negative allocations", () => {
    const plan = planDebit(buckets, 1_000);
    expect(plan.shortfall).toBe(800);
    expect(plan.allocations.reduce((a, x) => a + x.amount, 0)).toBe(200);
  });

  it("zero debit yields no allocations", () => {
    const plan = planDebit(buckets, 0);
    expect(plan.allocations).toEqual([]);
    expect(plan.shortfall).toBe(0);
  });

  it("rejects invalid amounts", () => {
    expect(() => planDebit(buckets, -5)).toThrow();
    expect(() => planDebit(buckets, 1.5)).toThrow();
  });
});

describe("planRefund", () => {
  it("returns credits to the originating buckets, largest contribution first", () => {
    const buckets = [
      bucket("daily", "daily_free", 0),
      bucket("purchased", "purchased", 0),
    ];
    const plan = planRefund(
      [
        { bucketId: "daily", amount: 30 },
        { bucketId: "purchased", amount: 70 },
      ],
      100,
      buckets,
    );
    expect(plan.allocations).toEqual([
      { bucketId: "purchased", bucketType: "purchased", amount: 70 },
      { bucketId: "daily", bucketType: "daily_free", amount: 30 },
    ]);
    expect(plan.fallbackAmount).toBe(0);
  });

  it("caps per-bucket refunds at the original contribution", () => {
    const buckets = [bucket("daily", "daily_free", 0)];
    const plan = planRefund([{ bucketId: "daily", amount: 20 }], 50, buckets);
    expect(plan.allocations).toEqual([{ bucketId: "daily", bucketType: "daily_free", amount: 20 }]);
    // The 30-credit remainder falls back to the lowest-priority type present.
    expect(plan.fallbackType).toBe("daily_free");
    expect(plan.fallbackAmount).toBe(30);
  });

  it("reports the lowest-priority fallback type for vanished buckets", () => {
    const buckets = [bucket("s", "subscription", 5), bucket("p", "purchased", 5)];
    const plan = planRefund([{ bucketId: "vanished", amount: 40 }], 40, buckets);
    expect(plan.allocations).toEqual([]);
    expect(plan.fallbackType).toBe("purchased");
    expect(plan.fallbackAmount).toBe(40);
  });
});
