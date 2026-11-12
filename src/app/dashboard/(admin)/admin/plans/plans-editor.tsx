"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updatePlanAction,
  updateSettingAction,
  updateTopupPackAction,
  type AdminActionState,
} from "@/app/actions/admin";

const initialState: AdminActionState = {};

export interface PlanDraft {
  id: string;
  name: string;
  tagline: string;
  priceRupees: number;
  monthlyCredits: number;
  dailyFreeCredits: number;
  sortOrder: number;
  active: boolean;
}

export interface PackDraft {
  id: string;
  name: string;
  priceRupees: number;
  credits: number;
  bonusCredits: number;
  active: boolean;
}

export interface SettingsDraft {
  creditValuePaise: number;
  fxInrPerUsd: number;
  defaultMarkupPct: number;
  minChargeCredits: number;
  lowBalanceAlertCredits: number;
  reservationTtlMinutes: number;
  sessionTtlDays: number;
}

export function PlansEditor({
  plans,
  packs,
  settings,
}: {
  plans: PlanDraft[];
  packs: PackDraft[];
  settings: SettingsDraft;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-text-0">Plans & settings</h1>
        <p className="mt-1 text-sm text-text-1">
          Money is stored in integer paise; the forms take whole rupees. Every change is audited.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-text-0">Subscription plans</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {plans.map((plan) => (
            <PlanForm key={plan.id} plan={plan} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-text-0">Top-up packs</h2>
        <div className="grid gap-3 xl:grid-cols-3">
          {packs.map((pack) => (
            <PackForm key={pack.id} pack={pack} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-text-0">Platform settings</h2>
        <div className="glass flex flex-col gap-4 rounded-xl p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SettingField label="creditValuePaise" value={settings.creditValuePaise} hint="paise per credit (100 = ₹1/credit)" />
            <SettingField label="fxInrPerUsd" value={settings.fxInrPerUsd} hint="display assumption, not a live feed" />
            <SettingField label="defaultMarkupPct" value={settings.defaultMarkupPct} hint="fallback model markup %" />
            <SettingField label="minChargeCredits" value={settings.minChargeCredits} hint="minimum billable request" />
            <SettingField label="lowBalanceAlertCredits" value={settings.lowBalanceAlertCredits} hint="alert threshold" />
            <SettingField label="reservationTtlMinutes" value={settings.reservationTtlMinutes} hint="stale-hold expiry" />
            <SettingField label="sessionTtlDays" value={settings.sessionTtlDays} hint="login lifetime" />
          </div>
          <p className="text-xs text-text-2">
            consumptionOrder is fixed to daily_free → promotional → subscription → purchased in
            this build (a setting row exists; the editor is numeric-only by design for now).
          </p>
        </div>
      </section>
    </div>
  );
}

function PlanForm({ plan }: { plan: PlanDraft }) {
  const [state, formAction, pending] = useActionState(updatePlanAction, initialState);

  return (
    <form action={formAction} className="glass flex flex-col gap-3 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-0">{plan.name}</h3>
        <Badge variant={plan.active ? "success" : "warn"}>{plan.active ? "active" : "hidden"}</Badge>
      </div>
      <input type="hidden" name="planId" value={plan.id} />
      <input type="hidden" name="active" value={plan.active ? "on" : "off"} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-1">
          Name
          <Input name="name" defaultValue={plan.name} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-1">
          Price (₹/month)
          <Input name="priceRupees" type="number" min={0} defaultValue={plan.priceRupees} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-1">
          Monthly credits
          <Input name="monthlyCredits" type="number" min={0} defaultValue={plan.monthlyCredits} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-1">
          Daily free credits
          <Input name="dailyFreeCredits" type="number" min={0} defaultValue={plan.dailyFreeCredits} required />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-text-1">
          Tagline
          <Input name="tagline" defaultValue={plan.tagline} maxLength={160} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-1">
          Sort order
          <Input name="sortOrder" type="number" min={0} max={999} defaultValue={plan.sortOrder} required />
        </label>
        <label className="flex items-end gap-2 pb-1 text-xs text-text-1">
          <input
            type="checkbox"
            name="activeCheck"
            defaultChecked={plan.active}
            className="size-4 accent-[var(--violet)]"
            onChange={(e) => {
              const form = e.currentTarget.closest("form");
              const hidden = form?.querySelector<HTMLInputElement>('input[name="active"]');
              if (hidden) hidden.value = e.currentTarget.checked ? "on" : "off";
            }}
          />
          Active
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.notice ? <span className="text-xs text-success">{state.notice}</span> : null}
        {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}

function PackForm({ pack }: { pack: PackDraft }) {
  const [state, formAction, pending] = useActionState(updateTopupPackAction, initialState);

  return (
    <form action={formAction} className="glass flex flex-col gap-3 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-0">{pack.name}</h3>
        <Badge variant={pack.active ? "success" : "warn"}>{pack.active ? "active" : "hidden"}</Badge>
      </div>
      <input type="hidden" name="packId" value={pack.id} />
      <input type="hidden" name="active" value={pack.active ? "on" : "off"} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-1">
          Price (₹)
          <Input name="priceRupees" type="number" min={0} defaultValue={pack.priceRupees} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-1">
          Credits
          <Input name="credits" type="number" min={0} defaultValue={pack.credits} required />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-text-1">
          Bonus credits
          <Input name="bonusCredits" type="number" min={0} defaultValue={pack.bonusCredits} required />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-text-1">
        <input
          type="checkbox"
          defaultChecked={pack.active}
          className="size-4 accent-[var(--violet)]"
          onChange={(e) => {
            const form = e.currentTarget.closest("form");
            const hidden = form?.querySelector<HTMLInputElement>('input[name="active"]');
            if (hidden) hidden.value = e.currentTarget.checked ? "on" : "off";
          }}
        />
        Active
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.notice ? <span className="text-xs text-success">{state.notice}</span> : null}
        {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}

function SettingField({ label, value, hint }: { label: string; value: number; hint: string }) {
  const [state, formAction, pending] = useActionState(updateSettingAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="key" value={label} />
      <label className="flex flex-col gap-1 text-xs text-text-1">
        <span className="font-mono text-[11px] text-violet">{label}</span>
        <span className="text-[10px] text-text-2">{hint}</span>
        <Input name="value" type="number" defaultValue={value} required className="h-9" />
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "…" : "Save"}
        </Button>
        {state.notice ? <span className="text-xs text-success">{state.notice}</span> : null}
        {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}
