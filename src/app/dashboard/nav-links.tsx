"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  CircleDollarSign,
  CreditCard,
  Gift,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareText,
  Settings2,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const GROUPS: { title: string; items: { href: string; label: string; icon: LucideIcon; badge?: string }[] }[] = [
  {
    title: "Build",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/chat", label: "Playground", icon: MessageSquareText },
      { href: "/dashboard/api-keys", label: "API keys", icon: KeyRound },
      { href: "/dashboard/usage", label: "Usage & logs", icon: Activity },
      { href: "/models", label: "Models", icon: Sparkles },
    ],
  },
  {
    title: "Billing",
    items: [
      { href: "/dashboard/subscription", label: "Plans", icon: CircleDollarSign },
      { href: "/dashboard/wallet", label: "Balance & top-up", icon: WalletCards },
      { href: "/dashboard/referrals", label: "Rewards", icon: Gift },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
      { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
      { href: "/dashboard/feedback", label: "Feedback", icon: MessageSquareText },
    ],
  },
];

export function NavLinks({ isAdmin, compact = false }: { isAdmin: boolean; compact?: boolean }) {
  const pathname = usePathname();
  if (compact) {
    return (
      <nav aria-label="Workspace" className="flex min-w-max gap-1">
        {GROUPS.flatMap((group) => group.items).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href.split("?")[0];
          return (
                  <Link key={item.href} href={item.href} prefetch aria-current={active ? "page" : undefined} className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] transition-colors",
              active ? "bg-violet/10 text-violet" : "text-text-2 hover:bg-[var(--glass-bg)] hover:text-text-0",
            )}>
              <Icon className="size-3.5" />{item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Workspace" className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h2 className="mb-1.5 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-2">{group.title}</h2>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href.split("?")[0];
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(
                    "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] transition-colors",
                    active ? "bg-[var(--glass-bg-hover)] font-semibold text-text-0 shadow-sm" : "text-text-1 hover:bg-[var(--glass-bg)] hover:text-text-0",
                  )}>
                    {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-violet" /> : null}
                    <Icon className={cn("size-4", active ? "text-violet" : "text-text-2 group-hover:text-text-0")} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? <span className="rounded bg-violet/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-violet">{item.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {isAdmin ? (
        <section className="border-t border-line pt-3">
          <h2 className="mb-1.5 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-2">Admin</h2>
          <Link href="/dashboard/admin" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-text-1 hover:bg-violet/10 hover:text-text-0">
            <ShieldCheck className="size-4 text-violet" /> Admin console
          </Link>
          <Link href="/dashboard/admin/payments" className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs", pathname === "/dashboard/admin/payments" ? "bg-violet/10 font-semibold text-violet" : "text-text-1 hover:bg-violet/10 hover:text-text-0")}>
            <CreditCard className="size-4" /> Payment review
          </Link>
        </section>
      ) : null}
    </nav>
  );
}
