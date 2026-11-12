import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/db";
import { plans, topupPacks } from "@/db/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettings } from "@/lib/settings";
import { PlansEditor } from "./plans-editor";

export const metadata: Metadata = { title: "Admin · Plans & Settings" };

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<PlansSkeleton />}>
      <PlansContent />
    </Suspense>
  );
}

async function PlansContent() {
  const planRows = await db.select().from(plans).orderBy(plans.sortOrder);
  const packRows = await db.select().from(topupPacks).orderBy(topupPacks.sortOrder);
  const settings = await getSettings();

  return (
    <PlansEditor
      plans={planRows.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline ?? "",
        priceRupees: Math.round(p.pricePaiseMonthly / 100),
        monthlyCredits: Number(p.monthlyCredits),
        dailyFreeCredits: Number(p.dailyFreeCredits),
        sortOrder: p.sortOrder,
        active: p.active,
      }))}
      packs={packRows.map((p) => ({
        id: p.id,
        name: p.name,
        priceRupees: Math.round(p.pricePaise / 100),
        credits: Number(p.credits),
        bonusCredits: Number(p.bonusCredits),
        active: p.active,
      }))}
      settings={{
        creditValuePaise: settings.creditValuePaise,
        fxInrPerUsd: settings.fxInrPerUsd,
        defaultMarkupPct: settings.defaultMarkupPct,
        minChargeCredits: settings.minChargeCredits,
        lowBalanceAlertCredits: settings.lowBalanceAlertCredits,
        reservationTtlMinutes: settings.reservationTtlMinutes,
        sessionTtlDays: settings.sessionTtlDays,
      }}
    />
  );
}

function PlansSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-72" />
      <Skeleton className="h-56" />
    </div>
  );
}
