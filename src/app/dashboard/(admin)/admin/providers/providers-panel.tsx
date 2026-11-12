"use client";

import { useActionState } from "react";
import { Check, KeyRound, PlugZap, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProviderCredentialAction, testProviderConnectionAction, removeProviderCredentialAction, type ProviderActionState } from "@/app/actions/providers";

const initialState: ProviderActionState = {};

interface ProviderRow {
  id: string;
  slug: string;
  name: string;
  adapter: string;
  baseUrl: string;
  notes: string | null;
  enabled: boolean;
  hasCredential: boolean;
  updatedAt: Date;
}

export function ProvidersPanel({ providers }: { providers: ProviderRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet">Phase 3</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-0">Provider connections</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-1">
          Save upstream API keys in encrypted storage, then test the connection. Keys are never sent to the browser again after saving.
        </p>
      </header>

      <div className="glass rounded-xl p-4 text-xs leading-relaxed text-text-2">
        Provider keys are stored with AES-256-GCM using the server&apos;s APP_ENCRYPTION_KEY. They stay private to the server and are not shown after saving.
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
      </div>
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderRow }) {
  const [saveState, saveAction, savePending] = useActionState(saveProviderCredentialAction, initialState);
  const [testState, testAction, testPending] = useActionState(testProviderConnectionAction, initialState);
  const [removeState, removeAction, removePending] = useActionState(removeProviderCredentialAction, initialState);

  return (
    <section className="glass glass-edge flex flex-col gap-4 rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-0">{provider.name}</h2>
          <p className="mt-1 font-mono text-xs text-text-2">{provider.slug} · {provider.adapter}</p>
        </div>
        <Badge variant={provider.enabled ? "success" : provider.hasCredential ? "accent" : "outline"}>
          {provider.enabled ? "Connected" : provider.hasCredential ? "Key saved" : "Not connected"}
        </Badge>
      </div>

      <div className="rounded-lg border border-line bg-[var(--glass-bg)] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-2">Endpoint</p>
        <p className="mt-1 break-all font-mono text-xs text-text-1">{provider.baseUrl}</p>
      </div>
      {provider.notes ? <p className="text-xs leading-relaxed text-text-2">{provider.notes}</p> : null}

      <form
        action={saveAction}
        className="flex flex-col gap-3 border-t border-line pt-4"
        onSubmit={(event) => {
          const form = event.currentTarget;
          window.setTimeout(() => form.reset(), 0);
        }}
      >
        <input type="hidden" name="providerId" value={provider.id} />
        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
          <span className="flex items-center gap-1.5"><KeyRound className="size-3.5 text-violet" aria-hidden /> Upstream API key</span>
          <Input name="apiKey" type="password" autoComplete="new-password" required minLength={8} maxLength={500} placeholder={provider.hasCredential ? "Replace saved key" : "Paste provider key"} />
        </label>
        {saveState.error ? <p className="text-xs text-danger" role="alert">{saveState.error}</p> : null}
        {saveState.notice ? <p className="text-xs text-success" role="status">{saveState.notice}</p> : null}
        <Button type="submit" variant="glass" size="sm" disabled={savePending}>
          {savePending ? "Saving securely…" : "Save encrypted key"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <form action={testAction}>
          <input type="hidden" name="providerId" value={provider.id} />
          <Button type="submit" size="sm" disabled={testPending || !provider.hasCredential}>
            {testPending ? <><PlugZap className="size-4 animate-pulse" aria-hidden /> Testing…</> : <><Check className="size-4" aria-hidden /> Test and enable</>}
          </Button>
        </form>
        {provider.hasCredential ? (
          <form action={removeAction}>
            <input type="hidden" name="providerId" value={provider.id} />
            <Button type="submit" variant="ghost" size="sm" disabled={removePending}>
              <Trash2 className="size-4" aria-hidden />
              {removePending ? "Removing…" : "Remove key"}
            </Button>
          </form>
        ) : null}
        {testState.notice ? <p className="basis-full text-xs text-success" role="status">{testState.notice}</p> : null}
        {testState.error ? <p className="basis-full text-xs text-danger" role="alert">{testState.error}</p> : null}
        {removeState.notice ? <p className="basis-full text-xs text-success" role="status">{removeState.notice}</p> : null}
        {removeState.error ? <p className="basis-full text-xs text-danger" role="alert">{removeState.error}</p> : null}
      </div>

      {testState.models?.length ? (
        <div className="border-t border-line pt-3">
          <p className="text-xs font-medium text-text-1">Discovered model IDs</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {testState.models.slice(0, 12).map((model) => (
              <code key={model.id} title={model.name} className="max-w-full truncate rounded-md border border-line bg-[var(--glass-bg)] px-2 py-1 text-[10px] text-text-2">{model.id}</code>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
