"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cancelSubscriptionAction, type UserActionState } from "@/app/actions/user";

const initialState: UserActionState = {};

export function CancelSubscriptionButton() {
  const [state, formAction, pending] = useActionState(cancelSubscriptionAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" variant="outline" size="sm" className="self-start" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel at period end"}
      </Button>
      {state.notice ? <p className="text-xs text-success">{state.notice}</p> : null}
      {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
