"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type AuthActionState } from "@/app/actions/auth";
import { FieldError, Notice } from "../_components/auth-card";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const params = useSearchParams();
  // Persists the 2FA step across failed attempts without an effect: onSubmit
  // observes the PREVIOUS action result before the next one runs.
  const [needsTotp, setNeedsTotp] = useState(false);

  const suspended = params.get("suspended") === "1";
  const registration = params.get("registration") === "1";
  const reset = params.get("reset") === "1";
  const prefillEmail = params.get("email") ?? "";
  const next = params.get("next");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      onSubmit={() => {
        if (state.needsTotp) setNeedsTotp(true);
      }}
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {suspended ? (
        <Notice tone="error">This account is suspended. Contact support for help.</Notice>
      ) : null}
      {registration ? (
        <Notice tone="success">You can sign in now — no email verification is required.</Notice>
      ) : null}
      {reset ? <Notice tone="success">Password updated — sign in with your new password.</Notice> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.notice && needsTotp ? <Notice tone="info">{state.notice}</Notice> : null}

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Email
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={prefillEmail}
          placeholder="you@example.com"
        />
        <FieldError messages={state.fieldErrors?.email} />
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Password
        <Input name="password" type="password" autoComplete="current-password" required />
        <FieldError messages={state.fieldErrors?.password} />
      </label>

      {needsTotp ? (
        <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
          Authenticator code
          <Input
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            autoFocus
          />
        </label>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : needsTotp ? "Verify and sign in" : "Sign in"}
      </Button>

      <div className="flex items-center justify-between text-xs text-text-2">
        <Link href="/forgot-password" className="transition-colors hover:text-text-1">
          Forgot password?
        </Link>
        <Link href={next ? "/register?next=" + encodeURIComponent(next) : "/register"} className="transition-colors hover:text-text-1">
          Create account
        </Link>
      </div>
    </form>
  );
}
