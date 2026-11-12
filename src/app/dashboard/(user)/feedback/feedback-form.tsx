"use client";

import { useActionState, useState } from "react";
import { Send } from "lucide-react";
import { submitFeedbackAction, type WorkspaceActionState } from "@/app/actions/workspace";
import { Button } from "@/components/ui/button";

const initialState: WorkspaceActionState = {};
const ratings = [
  { value: 1, emoji: "😞", label: "Bad" }, { value: 2, emoji: "🙁", label: "Meh" },
  { value: 3, emoji: "😐", label: "Okay" }, { value: 4, emoji: "🙂", label: "Good" }, { value: 5, emoji: "😍", label: "Love it" },
];
const categories = ["feature idea", "model quality", "speed & reliability", "design & ease of use", "pricing & plans", "something broken", "other"];

export function FeedbackForm() {
  const [state, action, pending] = useActionState(submitFeedbackAction, initialState);
  const [files, setFiles] = useState<string[]>([]);
  return <form action={action} className="glass space-y-5 rounded-2xl border border-line p-5" aria-label="Send feedback">
    <div><h2 className="text-sm font-semibold text-text-0">How is Nexora working for you?</h2><div className="mt-3 grid grid-cols-5 gap-2">{ratings.map((rating) => <label key={rating.value} className="cursor-pointer"><input className="peer sr-only" type="radio" name="rating" value={rating.value} required /><span className="flex min-h-[66px] flex-col items-center justify-center rounded-xl border border-line text-xl transition hover:border-violet/50 peer-checked:border-violet peer-checked:bg-violet/10"><span>{rating.emoji}</span><span className="text-[10px] text-text-2">{rating.label}</span></span></label>)}</div></div>
    <fieldset><legend className="text-sm font-semibold text-text-0">What is it about? <span className="text-xs font-normal text-text-2">(optional)</span></legend><div className="mt-3 flex flex-wrap gap-2">{categories.map((category, index) => <label key={category} className="cursor-pointer"><input className="peer sr-only" type="radio" name="category" value={category} defaultChecked={index === categories.length - 1} /><span className="inline-flex rounded-full border border-line px-3 py-1.5 text-[11px] capitalize text-text-1 peer-checked:border-violet/60 peer-checked:bg-violet/10 peer-checked:text-text-0">{category}</span></label>)}</div></fieldset>
    <label className="block text-sm font-semibold text-text-0">Anything you’d like to add? <span className="text-xs font-normal text-text-2">(optional)</span><textarea name="message" maxLength={4000} rows={5} placeholder="Ideas, models you want, things that confuse you…" className="mt-3 w-full resize-y rounded-xl border border-line bg-[var(--glass-bg)] px-3 py-3 text-sm font-normal text-text-0 outline-none placeholder:text-text-2 focus:border-violet/50 focus:ring-2 focus:ring-violet/30" /></label>
    <label className="block text-sm font-semibold text-text-0">Screenshot <span className="text-xs font-normal text-text-2">(optional, up to 3 · max 200 KB each)</span><input name="screenshots" type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3).map((file) => file.name))} className="mt-3 block w-full text-xs text-text-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-bg-1 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-text-0" />{files.length ? <span className="mt-2 block text-xs text-text-2">{files.join(" · ")}</span> : null}</label>
    {state.error ? <p role="alert" className="text-xs text-danger">{state.error}</p> : null}
    <div className="flex justify-end"><Button type="submit" disabled={pending} className="gap-2"><Send className="size-3.5" />{pending ? "Sending…" : "Send feedback"}</Button></div>
  </form>;
}
