"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveWorkspacePreferencesAction, type WorkspaceActionState } from "@/app/actions/workspace";
import {
  changePasswordAction,
  confirmTotpAction,
  deleteAccountAction,
  disableTotpAction,
  initiateTotpAction,
  signOutOtherSessionsAction,
  updateProfileAction,
  type UserActionState,
} from "@/app/actions/user";

const initialState: UserActionState = {};

export function SettingsForms({
  name,
  email,
  accountId,
  phone,
  totpEnabled,
  models,
  preferences,
}: {
  name: string;
  email: string;
  accountId: string;
  phone: string;
  totpEnabled: boolean;
  models: { id: string; name: string; provider: string; locked: boolean; status: string }[];
  preferences: {
    defaultModel: string;
    maxOutputTokens: number;
    timezone: string;
    notifications: Record<string, boolean>;
    usageAlertPercent: number;
    lowBalanceCredits: number;
  };
}) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="glass flex flex-wrap gap-1 rounded-xl border border-line p-2 lg:sticky lg:top-20 lg:flex-col">
        {["Profile", "API defaults", "Notifications", "Security", "Delete account"].map((section) => <a key={section} href={`#${section.toLowerCase().replaceAll(" ", "-")}`} className="rounded-lg px-3 py-2 text-xs font-medium text-text-1 hover:bg-[var(--glass-bg-hover)] hover:text-text-0">{section}</a>)}
      </nav>
      <div className="min-w-0 space-y-4">
        <section id="profile" className="scroll-mt-24"><ProfileForm name={name} email={email} accountId={accountId} phone={phone} /></section>
        <ApiDefaults models={models} preferences={preferences} />
        <NotificationPreferences preferences={preferences} />
        <section id="security" className="scroll-mt-24 space-y-4"><PasswordForm /><TotpPanel totpEnabled={totpEnabled} email={email} />
          <section className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-5"><div><h2 className="text-sm font-semibold text-text-0">Sign out other devices</h2><p className="mt-1 text-xs text-text-2">Ends every session except this one — phones, other browsers and computers.</p></div><form action={signOutOtherSessionsAction}><Button type="submit" variant="outline" size="sm">Sign out others</Button></form></section>
        </section>
        <DeleteAccountSection />
      </div>
    </div>
  );
}

function ProfileForm({ name, email, accountId, phone }: { name: string; email: string; accountId: string; phone: string }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form
      action={formAction}
      className="glass flex flex-col gap-4 rounded-xl border border-line p-5"
      aria-label="Profile settings"
    >
      <div><h2 className="text-base font-semibold text-text-0">Profile</h2><p className="mt-1 text-xs text-text-2">How you appear on receipts and support tickets.</p></div>
      {state.notice ? <p className="text-xs text-success">{state.notice}</p> : null}
      {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Display name
        <Input name="name" defaultValue={name} required minLength={2} maxLength={80} />
        {state.fieldErrors?.name?.[0] ? (
          <span className="text-xs text-danger">{state.fieldErrors.name[0]}</span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Email
        <Input value={email} disabled />
        <span className="text-[11px] font-normal text-text-2">
          Your email is used to sign in and receive account updates.
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">Phone <span className="text-[11px] font-normal text-text-2">(optional)</span><Input name="phone" type="tel" defaultValue={phone} maxLength={35} /></label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">Account ID<Input readOnly value={accountId.slice(0, 8).toUpperCase()} /></label>
      </div>
      <Button type="submit" size="sm" className="self-start" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

function ApiDefaults({ models, preferences }: { models: { id: string; name: string; provider: string; locked: boolean; status: string }[]; preferences: { defaultModel: string; maxOutputTokens: number; timezone: string; notifications: Record<string, boolean>; usageAlertPercent: number; lowBalanceCredits: number } }) {
  const [state, action, pending] = useActionState(saveWorkspacePreferencesAction, {} as WorkspaceActionState);
  return <form id="api-defaults" action={action} className="glass scroll-mt-24 overflow-hidden rounded-xl border border-line">
    <input type="hidden" name="usageAlertPercent" value={preferences.usageAlertPercent} /><input type="hidden" name="lowBalanceCredits" value={preferences.lowBalanceCredits} />
    {NOTIFICATION_OPTIONS.filter(([key]) => preferences.notifications[key] ?? key !== "productUpdates").map(([key]) => <input key={key} type="hidden" name="notifications" value={key} />)}
    <header className="border-b border-line p-5"><h2 className="text-sm font-semibold text-text-0">API &amp; Playground defaults</h2><p className="mt-1 text-xs text-text-2">Used by Playground and as a starting point in API examples.</p></header>
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      <label className="text-xs font-medium text-text-1">Default model<select name="defaultModel" defaultValue={preferences.defaultModel} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bg-1 px-3 text-sm text-text-0"><option value="">Use Playground’s current model</option>{models.map((model) => <option key={model.id} value={model.id} disabled={model.locked || model.status !== "active"}>{model.name} — {model.id}{model.locked ? " (plan required)" : ""}</option>)}</select></label>
      <label className="text-xs font-medium text-text-1">Default max output tokens<Input name="maxOutputTokens" type="number" min={16} max={65536} defaultValue={preferences.maxOutputTokens} /><span className="text-[10px] text-text-2">16–65,536</span></label>
      <label className="text-xs font-medium text-text-1 sm:col-span-2">Timezone<Input name="timezone" defaultValue={preferences.timezone} maxLength={80} placeholder="e.g. Asia/Kolkata" /></label>
    </div>
    {state.error ? <p role="alert" className="px-5 text-xs text-danger">{state.error}</p> : null}{state.ok ? <p className="px-5 text-xs text-success">Defaults saved.</p> : null}
    <div className="flex justify-end border-t border-line bg-bg-1/60 p-4"><Button size="sm" disabled={pending}>{pending ? "Saving…" : "Save defaults"}</Button></div>
  </form>;
}

const NOTIFICATION_OPTIONS = [
  ["usageAlerts", "Usage alerts", "When you reach your alert threshold of the monthly allowance."],
  ["lowBalance", "Low balance", "When your balance drops below the threshold below."],
  ["paymentReceipts", "Payment receipts", "Confirmation for top-ups and plan purchases."],
  ["securityAlerts", "Security alerts", "New keys, password changes and sign-ins."],
  ["planChanges", "Plan changes", "Renewals, expiries and upgrades."],
  ["productUpdates", "Product updates", "New models and features, roughly twice a month."],
] as const;

function NotificationPreferences({ preferences }: { preferences: { defaultModel: string; maxOutputTokens: number; timezone: string; notifications: Record<string, boolean>; usageAlertPercent: number; lowBalanceCredits: number } }) {
  const [state, action, pending] = useActionState(saveWorkspacePreferencesAction, {} as WorkspaceActionState);
  return <form id="notifications" action={action} className="glass scroll-mt-24 overflow-hidden rounded-xl border border-line">
    <input type="hidden" name="defaultModel" value={preferences.defaultModel} /><input type="hidden" name="maxOutputTokens" value={preferences.maxOutputTokens} /><input type="hidden" name="timezone" value={preferences.timezone} />
    <header className="border-b border-line p-5"><h2 className="text-sm font-semibold text-text-0">Notifications</h2><p className="mt-1 text-xs text-text-2">Choose what appears in your dashboard inbox.</p></header>
    <div className="divide-y divide-line">{NOTIFICATION_OPTIONS.map(([key, title, detail]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4"><span><span className="block text-sm font-semibold text-text-0">{title}</span><span className="mt-1 block text-xs text-text-2">{detail}</span></span><input type="checkbox" name="notifications" value={key} defaultChecked={preferences.notifications[key] ?? key !== "productUpdates"} className="size-4 accent-violet" /></label>)}</div>
    <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2"><label className="text-xs font-semibold text-text-1">Usage alert at (% of allowance)<Input name="usageAlertPercent" type="number" min={10} max={100} defaultValue={preferences.usageAlertPercent} /></label><label className="text-xs font-semibold text-text-1">Low balance below (credits)<Input name="lowBalanceCredits" type="number" min={0} max={1000000000} defaultValue={preferences.lowBalanceCredits} /></label></div>
    {state.error ? <p role="alert" className="px-5 text-xs text-danger">{state.error}</p> : null}{state.ok ? <p className="px-5 text-xs text-success">Notification preferences saved.</p> : null}
    <div className="flex justify-end border-t border-line bg-bg-1/60 p-4"><Button size="sm" disabled={pending}>{pending ? "Saving…" : "Save notifications"}</Button></div>
  </form>;
}

function DeleteAccountSection() {
  const [state, action, pending] = useActionState(deleteAccountAction, initialState);
  return <form id="delete-account" action={action} className="glass scroll-mt-24 flex flex-wrap items-end gap-4 rounded-xl border border-danger/30 p-5">
    <div className="w-full"><h2 className="text-sm font-semibold text-danger">Delete account</h2><p className="mt-1 text-xs text-text-2">This closes your account and signs out every device. Remaining balance is forfeited.</p></div>
    <label className="min-w-[180px] flex-1 text-xs font-semibold text-text-1">Password<Input name="password" type="password" autoComplete="current-password" required /></label>
    <label className="min-w-[150px] flex-1 text-xs font-semibold text-text-1">Type DELETE to confirm<Input name="confirmation" required /></label>
    {state.error ? <p role="alert" className="w-full text-xs text-danger">{state.error}</p> : null}
    <Button type="submit" variant="destructive" size="sm" disabled={pending}>{pending ? "Closing…" : "Delete account"}</Button>
  </form>;
}

function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form
      action={formAction}
      className="glass flex flex-col gap-4 rounded-xl p-5"
      aria-label="Change password"
    >
      <h2 className="text-base font-semibold text-text-0">Password</h2>
      {state.notice ? <p className="text-xs text-success">{state.notice}</p> : null}
      {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Current password
        <Input name="current" type="password" autoComplete="current-password" required />
        {state.fieldErrors?.current?.[0] ? (
          <span className="text-xs text-danger">{state.fieldErrors.current[0]}</span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        New password
        <Input name="password" type="password" autoComplete="new-password" required />
        {state.fieldErrors?.password?.[0] ? (
          <span className="text-xs text-danger">{state.fieldErrors.password[0]}</span>
        ) : (
          <span className="text-[11px] font-normal text-text-2">
            At least 8 characters, with one letter and one number.
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Confirm new password
        <Input name="confirm" type="password" autoComplete="new-password" required />
        {state.fieldErrors?.confirm?.[0] ? (
          <span className="text-xs text-danger">{state.fieldErrors.confirm[0]}</span>
        ) : null}
      </label>
      <Button type="submit" size="sm" className="self-start" disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}

function TotpPanel({ totpEnabled, email }: { totpEnabled: boolean; email: string }) {
  const [setup, setSetup] = useState<{ secretBase32: string; uri: string } | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();

  const [confirmState, confirmAction, confirmPending] = useActionState(confirmTotpAction, initialState);
  const [disableState, disableAction, disablePending] = useActionState(disableTotpAction, initialState);

  useEffect(() => {
    if (!setup?.uri) return;
    let cancelled = false;
    QRCode.toDataURL(setup.uri, { margin: 1, width: 200 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => setQrDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [setup?.uri]);

  function startSetup() {
    setSetupError(null);
    startTransition(async () => {
      const result = await initiateTotpAction();
      if (result.secretBase32 && result.uri) {
        setSetup({ secretBase32: result.secretBase32, uri: result.uri });
      } else {
        setSetupError(result.error ?? "Could not start setup.");
      }
    });
  }

  if (totpEnabled) {
    return (
      <form
        action={disableAction}
        className="glass flex flex-col gap-4 rounded-xl p-5"
        aria-label="Disable two-factor authentication"
      >
        <h2 className="text-base font-semibold text-text-0">Two-factor authentication</h2>
        <p className="text-xs text-success">2FA is active on this account.</p>
        {disableState.notice ? <p className="text-xs text-success">{disableState.notice}</p> : null}
        {disableState.error ? <p className="text-xs text-danger">{disableState.error}</p> : null}

        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
          Password
          <Input name="password" type="password" autoComplete="current-password" required />
          {disableState.fieldErrors?.password?.[0] ? (
            <span className="text-xs text-danger">{disableState.fieldErrors.password[0]}</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
          Authenticator code
          <Input name="code" inputMode="numeric" maxLength={6} required />
        </label>
        <Button type="submit" variant="destructive" size="sm" className="self-start" disabled={disablePending}>
          {disablePending ? "Disabling…" : "Disable 2FA"}
        </Button>
      </form>
    );
  }

  if (setup) {
    return (
      <form
        action={confirmAction}
        className="glass flex flex-col gap-4 rounded-xl p-5"
        aria-label="Confirm two-factor setup"
      >
        <h2 className="text-base font-semibold text-text-0">Two-factor authentication</h2>
        <ol className="flex flex-col gap-1 text-xs leading-relaxed text-text-1">
          <li>1. Scan the QR code with your authenticator app (Google, 1Password, Aegis…).</li>
          <li>2. Enter the current 6-digit code to confirm.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-4">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={`QR code for TOTP setup of ${email}`}
              width={160}
              height={160}
              className="rounded-md bg-white p-2"
            />
          ) : null}
          <div className="min-w-0 flex-1 text-xs">
            <p className="mb-1 font-medium text-text-1">Manual entry secret</p>
            <code className="block break-all rounded bg-bg-3 px-2 py-1.5 font-mono text-[11px] text-text-0">
              {setup.secretBase32}
            </code>
          </div>
        </div>

        {confirmState.notice ? <p className="text-xs text-success">{confirmState.notice}</p> : null}
        {confirmState.error ? <p className="text-xs text-danger">{confirmState.error}</p> : null}

        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
          Authenticator code
          <Input name="code" inputMode="numeric" maxLength={6} required placeholder="6-digit code" />
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={confirmPending}>
            {confirmPending ? "Verifying…" : "Confirm 2FA"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSetup(null)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-xl p-5" aria-label="Enable two-factor authentication">
      <h2 className="text-base font-semibold text-text-0">Two-factor authentication</h2>
      <p className="text-xs leading-relaxed text-text-2">
        Add a time-based one-time password (TOTP) as a second factor. Once enabled, signing in
        requires your password plus a rotating code from your authenticator app.
      </p>
      {setupError ? <p className="text-xs text-danger">{setupError}</p> : null}
      <Button onClick={startSetup} size="sm" className="self-start" disabled={starting}>
        {starting ? "Preparing…" : "Set up 2FA"}
      </Button>
    </div>
  );
}
