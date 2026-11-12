"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAction, type AuthActionState } from "@/app/actions/auth";
import { FieldError, Notice } from "../_components/auth-card";

const initialState: AuthActionState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const params = useSearchParams();
  const referralCode = params.get("ref")?.trim().toUpperCase() ?? "";
  const next = params.get("next");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {referralCode ? <input type="hidden" name="referralCode" value={referralCode} /> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Name
        <Input name="name" autoComplete="name" required placeholder="Ada Lovelace" />
        <FieldError messages={state.fieldErrors?.name} />
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Email
        <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        <FieldError messages={state.fieldErrors?.email} />
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-text-1">
        Password
        <Input name="password" type="password" autoComplete="new-password" required />
        <FieldError messages={state.fieldErrors?.password} />
        <span className="text-[11px] font-normal text-text-2">
          At least 8 characters, with one letter and one number.
        </span>
      </label>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-xs text-text-2">
        Already have an account?{" "}
        <Link href={next ? "/login?next=" + encodeURIComponent(next) : "/login"} className="text-text-1 transition-colors hover:text-text-0">
          Sign in
        </Link>
      </p>
    </form>
  );
}
