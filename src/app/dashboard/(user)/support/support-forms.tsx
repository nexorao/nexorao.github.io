"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { createSupportTicketAction, replyToSupportTicketAction, type WorkspaceActionState } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";

const initialState: WorkspaceActionState = {};

export function SupportForms({ ticketId, create = false }: { ticketId?: string; create?: boolean }) {
  const [createState, createAction, createPending] = useActionState(createSupportTicketAction, initialState);
  const [replyState, replyAction, replyPending] = useActionState(replyToSupportTicketAction, initialState);
  if (create) return <form action={createAction} className="mt-5 grid gap-3 md:grid-cols-2">
    <label className="text-xs font-semibold text-text-1">Subject<input name="subject" required minLength={4} maxLength={140} placeholder="Briefly describe the issue" className="mt-1.5 h-10 w-full rounded-lg border border-line bg-[var(--glass-bg)] px-3 text-sm font-normal text-text-0 outline-none focus:border-violet/50" /></label>
    <label className="text-xs font-semibold text-text-1">Category<select name="category" className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bg-1 px-3 text-sm font-normal text-text-0"><option value="general">General</option><option value="billing">Billing</option><option value="account">Account</option><option value="models">Models</option><option value="bug">Bug report</option></select></label>
    <label className="text-xs font-semibold text-text-1 md:col-span-2">What happened?<textarea name="message" required minLength={10} maxLength={5000} rows={4} placeholder="Include the steps and any error you saw…" className="mt-1.5 w-full rounded-lg border border-line bg-[var(--glass-bg)] px-3 py-2.5 text-sm font-normal text-text-0 outline-none focus:border-violet/50" /></label>
    {createState.error ? <p role="alert" className="text-xs text-danger md:col-span-2">{createState.error}</p> : null}
    <div className="flex justify-end md:col-span-2"><Button disabled={createPending} className="gap-2"><Send className="size-3.5" />{createPending ? "Opening…" : "Create ticket"}</Button></div>
  </form>;
  if (!ticketId) return null;
  return <form action={replyAction} className="flex items-end gap-2 border-t border-line p-4">
    <input type="hidden" name="ticketId" value={ticketId} />
    <label className="min-w-0 flex-1 text-[10px] font-medium text-text-2">Reply<textarea name="message" required minLength={2} maxLength={5000} rows={2} placeholder="Write a reply…" className="mt-1 block w-full resize-y rounded-lg border border-line bg-[var(--glass-bg)] px-3 py-2 text-sm text-text-0 outline-none focus:border-violet/50" /></label>
    <Button size="sm" disabled={replyPending} aria-label="Send reply"><Send className="size-4" /></Button>
    {replyState.error ? <p role="alert" className="text-xs text-danger">{replyState.error}</p> : null}
  </form>;
}
