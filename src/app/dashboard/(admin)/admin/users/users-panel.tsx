"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  changeUserPlanAction,
  deductCreditsAction,
  grantCreditsAction,
  restoreUserAction,
  suspendUserAction,
  type AdminActionState,
} from "@/app/actions/admin";
import type { AdminUserRow } from "@/lib/admin/queries";

const initialState: AdminActionState = {};

interface PlanOption {
  id: string;
  name: string;
  active: boolean;
}

export function UsersPanel({
  rows,
  plans,
  initialQuery,
}: {
  rows: AdminUserRow[];
  plans: PlanOption[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text-0">Users</h1>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(query ? `/dashboard/admin/users?q=${encodeURIComponent(query)}` : "/dashboard/admin/users");
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email or name…"
            className="w-56"
            aria-label="Search users"
          />
          <Button type="submit" variant="glass" size="sm">
            Search
          </Button>
        </form>
      </header>

      <div className="glass overflow-x-auto rounded-xl p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-text-2">
              <th className="py-2 pr-3 font-medium">User</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="py-2 pr-3 text-right font-medium">Balance</th>
              <th className="py-2 pr-3 font-medium">Joined</th>
              <th className="py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-2">
                  No users match this search.
                </td>
              </tr>
            ) : (
              rows.map((row) => <UserRow key={row.id} row={row} plans={plans} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ row, plans }: { row: AdminUserRow; plans: PlanOption[] }) {
  return (
    <tr className="border-b border-line/50 align-top last:border-0">
      <td className="py-3 pr-3">
        <p className="font-medium text-text-0">{row.name}</p>
        <p className="text-xs text-text-2">{row.email}</p>
        {row.totpEnabled ? (
          <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-violet">2FA</span>
        ) : null}
      </td>
      <td className="py-3 pr-3">
        <Badge variant={row.status === "active" ? "success" : "danger"}>{row.status}</Badge>
        {!row.emailVerified ? (
          <Badge variant="warn" className="ml-1">
            unverified
          </Badge>
        ) : null}
      </td>
      <td className="py-3 pr-3 text-text-1">{row.planId ?? "free"}</td>
      <td className="py-3 pr-3 text-right font-mono tabular-nums text-text-0">
        {row.balance.toLocaleString("en-IN")}
      </td>
      <td className="py-3 pr-3 whitespace-nowrap text-xs text-text-2">
        {row.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" })}
      </td>
      <td className="py-3">
        <div className="flex flex-wrap items-start justify-end gap-1.5">
          {row.status === "active" ? (
            <StatusForm action={suspendUserAction} userId={row.id} label="Suspend" />
          ) : (
            <StatusForm action={restoreUserAction} userId={row.id} label="Restore" />
          )}
          <CreditsDialog userId={row.id} email={row.email} />
          <PlanDialog userId={row.id} email={row.email} currentPlanId={row.planId} plans={plans} />
        </div>
      </td>
    </tr>
  );
}

function StatusForm({
  action,
  userId,
  label,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  userId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "…" : label}
      </Button>
      {state.error ? <span className="text-[10px] text-danger">{state.error}</span> : null}
    </form>
  );
}

function CreditsDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(grantCreditsAction, initialState);
  const [deductState, deductFormAction, deductPending] = useActionState(deductCreditsAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Credits
      </Button>
      <DialogContent className="max-w-md">
        <DialogTitle>Adjust credits — {email}</DialogTitle>
        <DialogDescription className="mb-4">
          Grants create a purchased/promotional bucket; deductions follow the normal consumption
          order. Both write ledger + audit rows.
        </DialogDescription>

        <div className="flex flex-col gap-5">
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="userId" value={userId} />
            <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
              Grant kind
              <select name="kind" className="h-10 rounded-md border border-line bg-bg-3 px-3 text-sm text-text-0">
                <option value="purchased">Purchased (never expires)</option>
                <option value="promotional">Promotional</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
              Amount (credits)
              <Input name="amount" type="number" min={1} max={10_000_000} required />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
              Note (optional)
              <Input name="note" maxLength={280} placeholder="e.g. launch campaign" />
            </label>
            {state.notice ? <p className="text-xs text-success">{state.notice}</p> : null}
            {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
            <Button type="submit" size="sm" disabled={pending} className="self-start">
              {pending ? "Granting…" : "Grant credits"}
            </Button>
          </form>

          <div className="border-t border-line pt-4">
            <form action={deductFormAction} className="flex flex-col gap-3">
              <input type="hidden" name="userId" value={userId} />
              <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
                Deduct amount (credits)
                <Input name="amount" type="number" min={1} max={10_000_000} required />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
                Reason
                <Input name="reason" minLength={3} maxLength={280} required placeholder="e.g. refund correction" />
                {deductState.fieldErrors?.reason?.[0] ? (
                  <span className="text-xs text-danger">{deductState.fieldErrors.reason[0]}</span>
                ) : null}
              </label>
              {deductState.notice ? <p className="text-xs text-success">{deductState.notice}</p> : null}
              {deductState.error ? <p className="text-xs text-danger">{deductState.error}</p> : null}
              <Button type="submit" variant="destructive" size="sm" disabled={deductPending} className="self-start">
                {deductPending ? "Deducting…" : "Deduct credits"}
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({
  userId,
  email,
  currentPlanId,
  plans,
}: {
  userId: string;
  email: string;
  currentPlanId: string | null;
  plans: PlanOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(changeUserPlanAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Plan
      </Button>
      <DialogContent className="max-w-md">
        <DialogTitle>Change plan — {email}</DialogTitle>
        <DialogDescription className="mb-4">
          Switching replaces the active subscription and grants the new plan&apos;s allowance for
          the new period (proration is not applied to manual plan changes).
        </DialogDescription>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="userId" value={userId} />
          <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
            Plan
            <select
              name="planId"
              defaultValue={currentPlanId ?? "free"}
              className="h-10 rounded-md border border-line bg-bg-3 px-3 text-sm text-text-0"
            >
              {plans
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
            Billing cycle
            <select
              name="billingCycle"
              defaultValue="monthly"
              className="h-10 rounded-md border border-line bg-bg-3 px-3 text-sm text-text-0"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          {state.notice ? <p className="text-xs text-success">{state.notice}</p> : null}
          {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
          <Button type="submit" size="sm" disabled={pending} className="self-start">
            {pending ? "Assigning…" : "Assign plan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
