import type { Metadata } from "next";
import { Suspense } from "react";
import { listAdminUsers } from "@/lib/admin/queries";
import { listPlans } from "@/lib/subscriptions";
import { UsersPanel } from "./users-panel";

export const metadata: Metadata = { title: "Admin · Users" };

export default function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <Suspense fallback={<UsersSkeleton />}>
      <UsersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function UsersContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = await listAdminUsers(q);
  const plans = await listPlans();

  return (
    <UsersPanel
      rows={rows}
      plans={plans.map((p) => ({ id: p.id, name: p.name, active: p.active }))}
      initialQuery={q ?? ""}
    />
  );
}

function UsersSkeleton() {
  return <div className="glass h-96 animate-pulse rounded-xl" aria-hidden />;
}
