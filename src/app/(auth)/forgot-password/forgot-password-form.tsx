"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordResetAction, type AuthActionState } from "@/app/actions/auth";
import { FieldError, Notice } from "../_components/auth-card";

const initialState: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.notice ? <Notice tone="success">{state.notice}</Notice> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Email
        <Input name="email" type="email" required placeholder="you@example.com" />
        <FieldError messages={state.fieldErrors?.email} />
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-center text-xs text-text-2">
        Remembered it?{" "}
        <Link href="/login" className="text-text-1 transition-colors hover:text-text-0">
          Sign in
        </Link>
      </p>
    </form>
  );
}
