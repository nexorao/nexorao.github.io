"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { createApiKeyAction, revokeApiKeyAction, type ApiKeyActionState } from "@/app/actions/api-keys";
import type { ApiKeySummary } from "@/lib/api-keys";
import { formatCredits } from "@/lib/format";

const initialState: ApiKeyActionState = {};

export function ApiKeysPanel({ keys, appUrl }: { keys: ApiKeySummary[]; appUrl: string }) {
  const active = keys.filter((key) => !key.revokedAt && (!key.expiresAt || key.expiresAt > new Date()));
  const requests = keys.reduce((sum, key) => sum + key.requests, 0);
  const credits = keys.reduce((sum, key) => sum + key.credits, 0);
  return <div className="flex flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-semibold tracking-tight text-text-0">API keys</h1><p className="mt-1.5 text-sm text-text-1">Create keys for your apps and monitor their usage.</p></div>
      <a href="/docs#authentication" className="text-sm font-semibold text-violet hover:text-text-0">How keys work ↗</a>
    </header>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Active keys" value={String(active.length)} note={`${keys.length} total`} />
      <Metric label="Requests this month" value={requests.toLocaleString("en-IN")} note="Across all keys" />
      <Metric label="Billed credits" value={formatCredits(credits)} note="Current month" />
      <Metric label="Keys with limits" value={String(active.filter((key) => key.monthlyLimitCredits !== null).length)} note="Monthly credit caps" />
    </div>
    <section className="glass overflow-hidden rounded-2xl border border-line">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-semibold text-text-0">Your keys</h2><p className="mt-1 text-xs text-text-2">The full secret is only shown once, when you create it.</p></div><span className="rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success"><ShieldCheck className="mr-1 inline size-3.5" /> Hashed at rest</span></div>
      {keys.length ? <div className="divide-y divide-line">{keys.map((key) => <KeyRow key={key.id} item={key} />)}</div> : <div className="px-5 py-8 text-center text-sm text-text-2">No API keys yet. Create one below to call NEXORA from your app.</div>}
    </section>
    <CreateKeyForm appUrl={appUrl} />
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="glass rounded-2xl border border-line p-5"><h2 className="font-semibold text-text-0">Quick start</h2><p className="mt-1 text-xs text-text-2">OpenAI-compatible chat completions endpoint</p><pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-bg-0 p-4 text-xs leading-6 text-text-1"><code>{`curl ${appUrl}/v1/chat/completions -H "Authorization: Bearer $NEXORA_API_KEY" -H "Content-Type: application/json" -d '{"model":"MODEL_ID","messages":[{"role":"user","content":"Hello"}]}'`}</code></pre><a href="/docs" className="mt-3 inline-block text-xs font-semibold text-violet">Read developer docs →</a></div>
      <div className="glass rounded-2xl border border-line p-5"><h2 className="font-semibold text-text-0">Protect your keys</h2><ul className="mt-3 flex flex-col gap-3 text-sm text-text-1"><li>• Keep secrets in server environment variables.</li><li>• Set a monthly credit limit for each key.</li><li>• Revoke any key immediately if it is exposed.</li><li>• Requests use your wallet and are charged by server-side model pricing.</li></ul></div>
    </section>
  </div>;
}

function CreateKeyForm({ appUrl }: { appUrl: string }) {
  const [state, action, pending] = useActionState(createApiKeyAction, initialState);
  const [copied, setCopied] = useState(false);
  async function copyKey() {
    if (!state.issuedKey) return;
    await navigator.clipboard.writeText(state.issuedKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return <section className="glass rounded-2xl border border-line p-5 sm:p-6">
    <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl border border-violet/20 bg-violet/10 text-violet"><KeyRound className="size-5" /></span><div><h2 className="font-semibold text-text-0">Create an API key</h2><p className="mt-1 text-xs text-text-2">Use a separate key for each app or environment.</p></div></div>
    <form action={action} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="flex flex-col gap-1.5 text-xs text-text-2">Key name<input name="name" required minLength={2} maxLength={48} placeholder="Production app" className="h-11 rounded-xl border border-line bg-bg-0 px-3 text-sm text-text-0 outline-none focus:border-violet" /></label>
      <label className="flex flex-col gap-1.5 text-xs text-text-2">Monthly cap (credits, optional)<input name="monthlyLimit" type="number" min="1" max="1000000000" placeholder="No limit" className="h-11 rounded-xl border border-line bg-bg-0 px-3 text-sm text-text-0 outline-none focus:border-violet" /></label>
      <button disabled={pending} className="h-11 rounded-xl bg-text-0 px-5 text-sm font-semibold text-bg-0 shadow-[0_8px_26px_rgba(127,92,255,0.18)] disabled:opacity-60">{pending ? "Creating…" : "＋ Create key"}</button>
    </form>
    {state.error ? <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p> : null}
    {state.notice ? <p role="status" className="mt-3 text-sm text-success">{state.notice}</p> : null}
    {state.issuedKey ? <div className="mt-4 rounded-xl border border-success/25 bg-success/5 p-4"><p className="text-xs font-semibold text-success">Copy your secret key now</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-bg-0 p-3 text-xs text-text-0">{state.issuedKey}</code><button type="button" onClick={copyKey} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-text-0">{copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy"}</button></div><p className="mt-2 text-[11px] text-text-2">Store it securely. NEXORA cannot show it again after you leave this page.</p></div> : null}
    <p className="mt-3 text-[11px] text-text-2">API base URL: <code>{appUrl}/v1</code></p>
  </section>;
}

function KeyRow({ item }: { item: ApiKeySummary }) {
  const [state, action, pending] = useActionState(revokeApiKeyAction.bind(null, item.id), initialState);
  const active = !item.revokedAt && (!item.expiresAt || item.expiresAt > new Date());
  return <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
    <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-text-0">{item.name}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-success/10 text-success" : "bg-bg-2 text-text-2"}`}>{active ? "Active" : "Revoked"}</span></div><code className="mt-1 block text-xs text-text-2">{item.prefix}••••••••••••</code><p className="mt-1 text-[10px] text-text-2">Created {item.createdAt.toLocaleDateString("en-IN")}{item.lastUsedAt ? ` · Last used ${item.lastUsedAt.toLocaleDateString("en-IN")}` : " · Never used"}</p></div>
    <div className="text-xs text-text-2">This month<br /><strong className="mt-1 inline-block text-sm text-text-0">{item.requests.toLocaleString("en-IN")} requests</strong></div>
    <div className="text-xs text-text-2">Credits used<br /><strong className="mt-1 inline-block text-sm text-text-0">{formatCredits(item.credits)}{item.monthlyLimitCredits ? ` / ${formatCredits(item.monthlyLimitCredits)}` : ""}</strong></div>
    {active ? <form action={action}><button disabled={pending} title="Revoke API key" className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger/20 px-3 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"><Trash2 className="size-3.5" />{pending ? "Revoking…" : "Revoke"}</button>{state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}</form> : <span className="text-xs text-text-2">Revoked {item.revokedAt?.toLocaleDateString("en-IN")}</span>}
  </div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <section className="glass rounded-2xl border border-line p-4"><p className="text-xs text-text-2">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-text-0">{value}</p><p className="mt-1 text-[11px] text-text-2">{note}</p></section>;
}
