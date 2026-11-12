"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordAction, type AuthActionState } from "@/app/actions/auth";
import { FieldError, Notice } from "../_components/auth-card";

const initialState: AuthActionState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const token = useSearchParams().get("token") ?? "";

  if (!token) {
    return (
      <Notice tone="error">
        This link is missing its token.{" "}
        <Link href="/forgot-password" className="underline underline-offset-4">
          Request a new reset link
        </Link>
        .
      </Notice>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        New password
        <Input name="password" type="password" autoComplete="new-password" required />
        <FieldError messages={state.fieldErrors?.password} />
        <span className="text-[11px] font-normal text-text-2">
          At least 8 characters, with one letter and one number.
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Confirm new password
        <Input name="confirm" type="password" autoComplete="new-password" required />
        <FieldError messages={state.fieldErrors?.confirm} />
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}
