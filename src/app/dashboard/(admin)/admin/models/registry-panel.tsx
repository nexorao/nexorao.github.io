"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown, Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveModelAction, type ModelActionState } from "@/app/actions/models";
import type { RegistryModelRow } from "@/lib/models/registry";

const initialState: ModelActionState = {};
const CATEGORIES = [
  { id: "claude", label: "Claude" },
  { id: "gpt", label: "GPT" },
  { id: "gemini", label: "Gemini" },
  { id: "open_source", label: "Open source" },
] as const;
const PLANS = ["free", "plus", "pro", "ultra", "max"] as const;

interface ProviderOption {
  id: string;
  slug: string;
  name: string;
}

interface PlanOption {
  id: string;
  name: string;
}

export function RegistryPanel({
  models,
  providers,
  plans,
}: {
  models: RegistryModelRow[];
  providers: ProviderOption[];
  plans: PlanOption[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet">Phase 3</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-0">Model registry</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-1">
          Update upstream model IDs, capabilities, pricing and plan access. Active models must have verified details and an official documentation source.
        </p>
      </header>

      <ModelEditor providers={providers} plans={plans} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-text-0">Existing models</h2>
          <Badge variant="outline">{models.length} total</Badge>
        </div>
        {models.map((model) => (
          <details key={model.dbId} className="group glass rounded-xl">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-violet/60">
              <ChevronDown className="size-4 shrink-0 text-text-2 transition-transform group-open:rotate-180" aria-hidden />
              <span className="min-w-40 flex-1">
                <span className="block text-sm font-medium text-text-0">{model.name}</span>
                <code className="mt-1 block text-[11px] text-text-2">{model.id}</code>
              </span>
              <span className="text-xs text-text-2">{model.provider}</span>
              <Badge variant={model.active ? "success" : "warn"}>{model.active ? "Active" : "Inactive"}</Badge>
              <Badge variant={model.lastVerified ? "outline" : "warn"}>{model.lastVerified ? "Verified" : "Unverified"}</Badge>
            </summary>
            <div className="border-t border-line p-4 md:p-5">
              <ModelEditor model={model} providers={providers} plans={plans} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function ModelEditor({
  model,
  providers,
  plans,
}: {
  model?: RegistryModelRow;
  providers: ProviderOption[];
  plans: PlanOption[];
}) {
  const [state, action, pending] = useActionState(saveModelAction, initialState);
  const defaultProviderId = model?.providerId ?? providers[0]?.id ?? "";

  return (
    <form action={action} className="flex flex-col gap-4">
      {model ? <input type="hidden" name="modelId" value={model.dbId} /> : null}

      {!model ? (
        <details className="glass rounded-xl">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium text-text-0 outline-none focus-visible:ring-2 focus-visible:ring-violet/60">
            <Plus className="size-4 text-violet" aria-hidden /> Add a model to the registry
          </summary>
          <div className="border-t border-line p-4 md:p-5">
            <ModelFields model={model} providers={providers} plans={plans} defaultProviderId={defaultProviderId} />
            <ActionFeedback state={state} />
            <Button type="submit" className="mt-4" disabled={pending || providers.length === 0}>
              <Save className="size-4" aria-hidden /> {pending ? "Saving…" : "Add model"}
            </Button>
          </div>
        </details>
      ) : (
        <>
          <ModelFields model={model} providers={providers} plans={plans} defaultProviderId={defaultProviderId} />
          <ActionFeedback state={state} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              <Save className="size-4" aria-hidden /> {pending ? "Saving…" : "Save model"}
            </Button>
            {model.lastVerified ? <Badge variant="success"><Check className="size-3" aria-hidden /> Verified {model.lastVerified}</Badge> : null}
          </div>
        </>
      )}
    </form>
  );
}

function ModelFields({
  model,
  providers,
  plans,
  defaultProviderId,
}: {
  model?: RegistryModelRow;
  providers: ProviderOption[];
  plans: PlanOption[];
  defaultProviderId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Upstream model ID">
          <Input name="slug" required minLength={2} maxLength={160} defaultValue={model?.id ?? ""} placeholder="provider/model-id" />
        </Field>
        <Field label="Display name">
          <Input name="name" required minLength={2} maxLength={100} defaultValue={model?.name ?? ""} placeholder="Model name" />
        </Field>
        <Field label="Provider">
          <select name="providerId" defaultValue={defaultProviderId} required className={selectClass}>
            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={model?.category ?? "claude"} className={selectClass}>
            {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={model?.status ?? "available"} className={selectClass}>
            <option value="available">Available</option>
            <option value="preview">Preview</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </Field>
        <Field label="Minimum plan">
          <select name="minPlanId" defaultValue={model?.minPlan ?? "free"} className={selectClass}>
            {PLANS.map((plan) => <option key={plan} value={plan}>{plans.find((row) => row.id === plan)?.name ?? plan}</option>)}
          </select>
        </Field>
        <Field label="Context window (tokens)">
          <Input name="contextWindow" type="number" min={1} max={10_000_000} step={1} defaultValue={model?.contextWindow ?? ""} placeholder="Leave blank if unknown" />
        </Field>
        <Field label="Maximum output (tokens)">
          <Input name="maxOutput" type="number" min={1} max={10_000_000} step={1} defaultValue={model?.maxOutput ?? ""} placeholder="Leave blank if unknown" />
        </Field>
        <Field label="Markup (%)">
          <Input name="markupPct" type="number" min={0} max={500} step={1} required defaultValue={model?.markupPct ?? 15} />
        </Field>
        <Field label="Input price (USD / 1M tokens)">
          <Input name="inputPrice" type="number" min={0} max={100000} step="0.000001" defaultValue={model?.inputUsdMicroPerMTok === null || model?.inputUsdMicroPerMTok === undefined ? "" : model.inputUsdMicroPerMTok / 1_000_000} placeholder="Leave blank if host-dependent" />
        </Field>
        <Field label="Output price (USD / 1M tokens)">
          <Input name="outputPrice" type="number" min={0} max={100000} step="0.000001" defaultValue={model?.outputUsdMicroPerMTok === null || model?.outputUsdMicroPerMTok === undefined ? "" : model.outputUsdMicroPerMTok / 1_000_000} placeholder="Leave blank if host-dependent" />
        </Field>
        <Field label="Official provider documentation URL">
          <Input name="sourceUrl" type="url" maxLength={2_000} defaultValue={model?.sourceUrl ?? ""} placeholder="https://…" />
        </Field>
        <Field label="Verified date">
          <Input name="verifiedAt" type="date" defaultValue={model?.lastVerified ?? ""} />
        </Field>
        <label className="flex items-end gap-2 rounded-lg border border-line px-3 py-2 text-xs text-text-1">
          <input type="checkbox" name="active" defaultChecked={model?.active ?? false} className="accent-violet" />
          Active in the public model registry
        </label>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-line px-3 py-3 text-xs text-text-1">
        <span className="font-medium text-text-2">Capabilities</span>
        <Checkbox name="vision" label="Vision" checked={model?.capabilities.vision ?? false} />
        <Checkbox name="tools" label="Tools" checked={model?.capabilities.tools ?? false} />
        <Checkbox name="reasoning" label="Reasoning" checked={model?.capabilities.reasoning ?? false} />
        <Checkbox name="verified" label="Details verified against official docs" checked={Boolean(model?.lastVerified)} />
      </div>

      <Field label="Admin notes">
        <textarea name="notes" rows={3} maxLength={1_000} defaultValue={model?.notes ?? ""} className={`${selectClass} h-auto resize-y`} placeholder="Data caveats, scheduled price changes, or internal verification notes" />
      </Field>
    </div>
  );
}

const selectClass = "w-full rounded-md border border-line bg-bg-2 px-3 py-2 text-sm text-text-0 outline-none transition-colors focus:border-violet/60";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
      {label}
      {children}
    </label>
  );
}

function Checkbox({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <input type="checkbox" name={name} defaultChecked={checked} className="accent-violet" /> {label}
    </label>
  );
}

function ActionFeedback({ state }: { state: ModelActionState }) {
  return (
    <>
      {state.error ? <p className="mt-3 text-xs text-danger" role="alert">{state.error}</p> : null}
      {state.notice ? <p className="mt-3 text-xs text-success" role="status">{state.notice}</p> : null}
    </>
  );
}
