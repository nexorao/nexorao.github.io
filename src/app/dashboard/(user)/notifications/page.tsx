import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq } from "drizzle-orm";
import { Bell, CheckCheck, CircleAlert, Sparkles } from "lucide-react";
import { db } from "@/db";
import { userNotifications } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/workspace";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Notifications" };
type Filter = "all" | "unread" | "alerts" | "announcements";

export default function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  return <Suspense fallback={<div className="space-y-5"><Skeleton className="h-12 w-56" /><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /></div>}><NotificationsContent searchParams={searchParams} /></Suspense>;
}

async function NotificationsContent({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const filter = (params.filter && ["all", "unread", "alerts", "announcements"].includes(params.filter) ? params.filter : "all") as Filter;
  const rows = await db.select().from(userNotifications).where(and(
    eq(userNotifications.userId, user.id),
    filter === "unread" ? eq(userNotifications.isRead, false) : undefined,
    filter === "alerts" ? eq(userNotifications.category, "alert") : undefined,
    filter === "announcements" ? eq(userNotifications.category, "announcement") : undefined,
  )).orderBy(desc(userNotifications.createdAt)).limit(100);
  const unreadRows = await db.select({ id: userNotifications.id }).from(userNotifications)
    .where(and(eq(userNotifications.userId, user.id), eq(userNotifications.isRead, false))).limit(100);
  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" }, { key: "unread", label: "Unread" }, { key: "alerts", label: "Alerts" }, { key: "announcements", label: "Announcements" },
  ];
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight text-text-0">Notifications</h1><p className="mt-1.5 text-sm text-text-1">Usage alerts, billing updates and announcements in one place.</p></div>
      <form action={markAllNotificationsReadAction}><button className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold text-text-0 hover:bg-[var(--glass-bg-hover)]"><CheckCheck className="size-4" />Mark all as read</button></form>
    </header>
    <nav aria-label="Notification filters" className="flex flex-wrap gap-6 border-b border-line">{tabs.map((tab) => <Link key={tab.key} href={tab.key === "all" ? "/dashboard/notifications" : `/dashboard/notifications?filter=${tab.key}`} className={`border-b-2 px-1 pb-3 text-sm font-medium ${filter === tab.key ? "border-violet text-text-0" : "border-transparent text-text-2 hover:text-text-0"}`}>{tab.label}{tab.key === "unread" && unreadRows.length ? <span className="ml-2 rounded-full bg-violet/15 px-1.5 py-0.5 text-[10px] text-violet">{unreadRows.length}</span> : null}</Link>)}</nav>
    {rows.length ? <section className="space-y-3"><p className="px-1 text-[10px] font-semibold uppercase tracking-[.14em] text-text-2">Recent</p>{rows.map((item) => <article key={item.id} className={`flex gap-3 rounded-2xl border border-line p-4 ${item.isRead ? "bg-bg-1" : "bg-violet/5"}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet">{item.category === "announcement" ? <Sparkles className="size-4" /> : <CircleAlert className="size-4" />}</span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-text-0">{item.title}</h2><time className="text-[11px] text-text-2">{item.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</time></div><p className="mt-1 text-sm leading-6 text-text-1">{item.body}</p><div className="mt-3 flex items-center gap-3">{item.href ? <Link href={item.href} className="text-xs font-semibold text-violet hover:underline">Open →</Link> : null}{!item.isRead ? <form action={markNotificationReadAction}><input type="hidden" name="id" value={item.id} /><button className="text-xs text-text-2 hover:text-text-0">Mark read</button></form> : <span className="text-[10px] text-text-2">Read</span>}</div></div>
    </article>)}</section> : <div className="grid min-h-64 place-items-center rounded-2xl border border-line bg-bg-1 p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--glass-bg)] text-text-2"><Bell className="size-5" /></span><h2 className="mt-4 font-semibold text-text-0">You’re all caught up</h2><p className="mt-1 text-sm text-text-2">New usage, payment and account updates will appear here.</p></div></div>}
  </div>;
}
