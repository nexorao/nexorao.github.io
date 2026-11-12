import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { listAuditWithActor } from "@/lib/admin/queries";

export const metadata: Metadata = { title: "Admin · Audit log" };

export default function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <Suspense fallback={<AuditSkeleton />}>
      <AuditContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AuditContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = await listAuditWithActor(q, 100);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text-0">Audit log</h1>
        <form className="flex gap-2" action="/dashboard/admin/audit" method="get">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Filter by action…"
            className="h-10 w-56 rounded-md border border-line bg-[var(--glass-bg)] px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
            aria-label="Filter audit actions"
          />
          <button
            type="submit"
            className="glass glass-interactive rounded-md px-3 text-xs text-text-0"
          >
            Filter
          </button>
        </form>
      </header>

      <p className="text-xs text-text-2">
        Every sensitive operation — auth events, admin changes, wallet adjustments — is recorded
        here with its actor. The log is append-only.
      </p>

      <div className="glass overflow-x-auto rounded-xl p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-text-2">
              <th className="py-2 pr-3 font-medium">When (UTC)</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 pr-3 font-medium">Entity</th>
              <th className="py-2 pr-3 font-medium">Actor</th>
              <th className="py-2 font-medium">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-2">
                  No audit events match.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-line/50 align-top last:border-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-text-2">
                    {row.createdAt.toLocaleString("en-GB", { timeZone: "UTC" })}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant="accent">{row.action}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-text-1">
                    {row.entityType}
                    {row.entityId ? (
                      <span className="block font-mono text-[10px] text-text-2">
                        {row.entityId.slice(0, 8)}…
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 text-text-1">{row.actorEmail ?? "system"}</td>
                  <td className="py-2.5 max-w-xs">
                    {row.metadata ? (
                      <code className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-text-2">
                        {JSON.stringify(row.metadata)}
                      </code>
                    ) : (
                      <span className="text-xs text-text-2">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditSkeleton() {
  return <div className="glass h-96 animate-pulse rounded-xl" aria-hidden />;
}
