import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq } from "drizzle-orm";
import { Activity, BookOpen, Code2, FileSearch, LifeBuoy, Plus } from "lucide-react";
import { db } from "@/db";
import { supportMessages, supportTickets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { closeSupportTicketAction } from "@/app/actions/workspace";
import { SupportForms } from "./support-forms";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Support" };
type Filter = "all" | "open" | "resolved";

export default function SupportPage({ searchParams }: { searchParams: Promise<{ ticket?: string; filter?: string }> }) {
  return <Suspense fallback={<div className="space-y-5"><Skeleton className="h-12 w-48" /><Skeleton className="h-20 w-full" /><Skeleton className="h-72 w-full" /></div>}><SupportContent searchParams={searchParams} /></Suspense>;
}

async function SupportContent({ searchParams }: { searchParams: Promise<{ ticket?: string; filter?: string }> }) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const filter = (params.filter && ["all", "open", "resolved"].includes(params.filter) ? params.filter : "all") as Filter;
  const tickets = await db.select().from(supportTickets).where(and(eq(supportTickets.userId, user.id), filter === "all" ? undefined : eq(supportTickets.status, filter))).orderBy(desc(supportTickets.updatedAt)).limit(100);
  const selected = tickets.find((ticket) => ticket.id === params.ticket) ?? tickets[0] ?? null;
  const messages = selected ? await db.select().from(supportMessages).where(eq(supportMessages.ticketId, selected.id)).orderBy(supportMessages.createdAt) : [];
  const resources = [
    { href: "/docs", icon: BookOpen, title: "Docs", detail: "Guides & API reference" },
    { href: "/api/health", icon: Activity, title: "System status", detail: "Live service health" },
    { href: "/docs#agent-setup", icon: Code2, title: "Agent setup", detail: "Connect your tools" },
    { href: "/dashboard/usage", icon: FileSearch, title: "Request logs", detail: "Find a model request" },
  ];
  const filters: { key: Filter; label: string }[] = [{ key: "all", label: "All" }, { key: "open", label: "Open" }, { key: "resolved", label: "Resolved" }];
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight text-text-0">Support</h1><p className="mt-1.5 text-sm text-text-1">Track conversations with the Nexora team and get help with your account.</p></div><a href="#new-ticket" className="inline-flex h-10 items-center gap-2 rounded-xl bg-text-0 px-4 text-sm font-semibold text-bg-0"><Plus className="size-4" />New ticket</a></header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{resources.map((item) => <Link key={item.title} href={item.href} className="glass flex items-center gap-3 rounded-xl border border-line p-4 transition hover:border-violet/40"><span className="grid size-10 place-items-center rounded-xl bg-violet/10 text-violet"><item.icon className="size-4" /></span><span><span className="block text-sm font-semibold text-text-0">{item.title}</span><span className="text-xs text-text-2">{item.detail}</span></span></Link>)}</div>
    <div className="grid items-start gap-4 xl:grid-cols-[.85fr_1.15fr]">
      <section className="glass overflow-hidden rounded-2xl border border-line"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4"><h2 className="text-sm font-semibold text-text-0">Your tickets</h2><nav className="flex rounded-xl border border-line p-1">{filters.map((item) => <Link key={item.key} href={item.key === "all" ? "/dashboard/support" : `/dashboard/support?filter=${item.key}`} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${filter === item.key ? "bg-[var(--glass-bg-hover)] text-text-0" : "text-text-2"}`}>{item.label}</Link>)}</nav></header>
        {tickets.length ? <div className="divide-y divide-line">{tickets.map((ticket) => <Link key={ticket.id} href={`/dashboard/support?ticket=${ticket.id}${filter !== "all" ? `&filter=${filter}` : ""}`} className={`block p-4 hover:bg-[var(--glass-bg)] ${selected?.id === ticket.id ? "bg-violet/5" : ""}`}><div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold text-text-0">{ticket.subject}</span><span className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${ticket.status === "open" ? "bg-violet/10 text-violet" : "bg-success/10 text-success"}`}>{ticket.status}</span></div><p className="mt-1 text-[11px] capitalize text-text-2">{ticket.category} · updated {ticket.updatedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</p></Link>)}</div> : <div className="grid min-h-52 place-items-center p-6 text-center"><div><LifeBuoy className="mx-auto size-7 text-text-2" /><p className="mt-3 text-sm font-semibold text-text-0">No tickets here</p><p className="mt-1 text-sm text-text-2">Open one and we’ll get back to you.</p></div></div>}
      </section>
      <section className="glass min-h-64 overflow-hidden rounded-2xl border border-line">
        {selected ? <><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-semibold text-text-0">{selected.subject}</h2><p className="mt-1 text-xs capitalize text-text-2">{selected.category} · {selected.status}</p></div>{selected.status !== "resolved" ? <form action={closeSupportTicketAction}><input type="hidden" name="ticketId" value={selected.id} /><button className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-text-1 hover:bg-[var(--glass-bg-hover)]">Resolve ticket</button></form> : null}</header>
          <div className="max-h-[430px] min-h-32 space-y-3 overflow-y-auto p-5">{messages.map((message) => <article key={message.id} className={`max-w-[90%] rounded-xl p-3 ${message.authorRole === "user" ? "ml-auto bg-violet/10" : "bg-[var(--glass-bg)]"}`}><p className="text-[10px] font-semibold capitalize text-violet">{message.authorRole === "user" ? "You" : "Nexora support"}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-1">{message.body}</p><time className="mt-2 block text-right text-[10px] text-text-2">{message.createdAt.toLocaleString("en-IN")}</time></article>)}</div>
          <SupportForms ticketId={selected.id} /></> : <div className="grid min-h-64 place-items-center p-6 text-center"><div><LifeBuoy className="mx-auto size-7 text-text-2" /><p className="mt-3 font-semibold text-text-0">Select a ticket</p><p className="mt-1 text-sm text-text-2">Its full conversation appears here.</p></div></div>}
      </section>
    </div>
    <section id="new-ticket" className="glass scroll-mt-24 rounded-2xl border border-line p-5"><h2 className="font-semibold text-text-0">Open a support ticket</h2><p className="mt-1 text-xs text-text-2">Share a few details so we can route this to the right person.</p><SupportForms create /></section>
  </div>;
}
