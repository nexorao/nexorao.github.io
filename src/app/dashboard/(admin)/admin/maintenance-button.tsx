"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { runMaintenanceAction, type AdminActionState } from "@/app/actions/admin";

const initialState: AdminActionState = {};

export function MaintenanceButton() {
  const [state, formAction, pending] = useActionState(runMaintenanceAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Running…" : "Run maintenance"}
      </Button>
      {state.notice ? <p className="max-w-xs text-right text-xs text-success">{state.notice}</p> : null}
      {state.error ? <p className="max-w-xs text-right text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
