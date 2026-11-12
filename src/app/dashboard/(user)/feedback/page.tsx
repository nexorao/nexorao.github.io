import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { MessageSquareText } from "lucide-react";
import { db } from "@/db";
import { userFeedback } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { FeedbackForm } from "./feedback-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Feedback" };

export default function FeedbackPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  return <Suspense fallback={<div className="space-y-5"><Skeleton className="h-12 w-48" /><Skeleton className="h-72 w-full" /></div>}><FeedbackContent searchParams={searchParams} /></Suspense>;
}

async function FeedbackContent({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const user = await getCurrentUser();
  const [params, entries] = await Promise.all([
    searchParams,
    db.select().from(userFeedback).where(eq(userFeedback.userId, user.id)).orderBy(desc(userFeedback.createdAt)).limit(20),
  ]);
  return <div className="space-y-6">
    <header><h1 className="text-3xl font-semibold tracking-tight text-text-0">Feedback</h1><p className="mt-1.5 text-sm text-text-1">Tell us how Nexora feels and what we should build next. Need help with a problem? <Link href="/dashboard/support" className="font-medium text-violet hover:underline">Open a support ticket</Link>.</p></header>
    {params.sent === "1" ? <p className="rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success">Thanks — your feedback was sent.</p> : null}
    <div className="grid items-start gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <FeedbackForm />
      <section className="glass overflow-hidden rounded-2xl border border-line"><header className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="font-semibold text-text-0">Your feedback</h2><span className="text-xs text-text-2">{entries.length}</span></header>
        {entries.length ? <div className="divide-y divide-line">{entries.map((entry) => <article key={entry.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-text-0">{"★".repeat(entry.rating)}<span className="text-text-2">{"★".repeat(5 - entry.rating)}</span></p><p className="mt-1 text-xs capitalize text-text-2">{entry.category} · {entry.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</p></div>{entry.attachments.length ? <span className="text-[10px] text-text-2">{entry.attachments.length} image{entry.attachments.length > 1 ? "s" : ""}</span> : null}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-1">{entry.message || "No extra details"}</p></article>)}</div> : <div className="grid min-h-48 place-items-center p-8 text-center"><div><MessageSquareText className="mx-auto size-7 text-text-2" /><h3 className="mt-3 text-sm font-semibold text-text-0">Nothing sent yet</h3><p className="mt-1 text-sm text-text-2">Your feedback and our replies will show up here.</p></div></div>}
      </section>
    </div>
  </div>;
}
