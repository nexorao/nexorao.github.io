import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/kit";
import { adminOverview, listAuditWithActor } from "@/lib/admin/queries";
import { formatCredits } from "@/lib/format";
import { MaintenanceButton } from "./maintenance-button";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <AdminOverviewContent />
    </Suspense>
  );
}

async function AdminOverviewContent() {
  const stats = await adminOverview();
  const recentAudit = await listAuditWithActor(undefined, 8);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text-0">Admin overview</h1>
        <MaintenanceButton />
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard
          label="Users"
          value={formatCredits(stats.totalUsers)}
          hint={`${stats.verifiedUsers} verified · ${stats.suspendedUsers} suspended`}
        />
        <StatCard
          label="Active subscriptions"
          value={formatCredits(stats.activeSubscriptions)}
          hint="paid plans in good standing"
        />
        <StatCard
          label="Credits liability"
          value={formatCredits(stats.creditsLiability)}
          hint="outstanding across all wallets"
          tone="accent"
        />
        <StatCard
          label="Held reservations"
          value={formatCredits(stats.heldCredits)}
          hint="locked by in-flight requests"
        />
        <StatCard label="Audit trail" value={formatCredits(recentAudit.length)} hint="latest events below" />
        <StatCard label="Maintenance" value="Manual" hint="run the reconciler any time" />
      </div>

      <div className="glass flex flex-col gap-3 rounded-xl p-5">
        <h2 className="text-base font-semibold text-text-0">Recent admin activity</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {recentAudit.length === 0 ? (
            <li className="text-text-2">No audit events yet.</li>
          ) : (
            recentAudit.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-2 border-b border-line/50 pb-2 last:border-0">
                <span className="font-mono text-xs text-violet">{row.action}</span>
                <span className="text-text-1">
                  {row.entityType}
                  {row.entityId ? ` · ${row.entityId.slice(0, 8)}…` : ""}
                </span>
                <span className="text-xs text-text-2">by {row.actorEmail ?? "system"}</span>
                <span className="ml-auto text-xs text-text-2">
                  {row.createdAt.toLocaleString("en-GB", { timeZone: "UTC" })}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
