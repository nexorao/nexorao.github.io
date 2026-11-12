"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bell, ChevronsUpDown, Code2, CreditCard, Cpu, Gift, Home, ImageIcon, KeyRound,
  Layers, LayoutGrid, LifeBuoy, MessageSquare, Search, Settings, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: "NEW" | "LIVE";
}

// Remove or re-point any href that doesn't exist in your app yet.
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Build",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutGrid },
      { href: "/dashboard/chat", label: "Playground", icon: Code2 },
      { href: "/dashboard/images", label: "Image Studio", icon: ImageIcon, badge: "NEW" },
      { href: "/dashboard/api-keys", label: "API keys", icon: KeyRound },
      { href: "/dashboard/usage", label: "Usage & logs", icon: BarChart3, badge: "LIVE" },
      { href: "/dashboard/models", label: "Models", icon: Cpu },
    ],
  },
  {
    group: "Billing",
    items: [
      { href: "/dashboard/subscription", label: "Plans", icon: Layers },
      { href: "/dashboard/wallet", label: "Balance & top-up", icon: Wallet },
      { href: "/dashboard/rewards", label: "Rewards", icon: Gift },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
      { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
      { href: "/dashboard/feedback", label: "Feedback", icon: MessageSquare },
    ],
  },
];

export interface ShellProps {
  children: React.ReactNode;
  user: { name: string; email: string };
  planName: string;
  allowance: { usedLabel: string; leftLabel: string; percent: number };
  balanceLabel: string;
  unreadNotifications: number;
}

export function DashboardShell({ children, user, planName, allowance, balanceLabel, unreadNotifications }: ShellProps) {
  const pathname = usePathname();
  const initials = user.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const current = NAV.flatMap((g) => g.items).find((i) => (i.href === "/dashboard" ? pathname === i.href : pathname.startsWith(i.href)));

  return (
    <div className="flex min-h-screen bg-bg-0 text-text-0">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-bg-1 lg:flex">
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="text-lg font-semibold tracking-tight">Nexora</Link>
          <span className="rounded-md border border-line bg-bg-3 px-2 py-0.5 text-[11px] text-text-1">{planName}</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Dashboard">
          {NAV.map((g) => (
            <div key={g.group} className="mt-4 first:mt-0">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-2">{g.group}</p>
              <ul className="flex flex-col gap-0.5">
                {g.items.map((item) => {
                  const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                          active ? "bg-[var(--glass-bg-hover)] font-medium text-text-0" : "text-text-1 hover:bg-[var(--glass-bg)] hover:text-text-0"
                        }`}
                      >
                        {active ? <span className="absolute -left-3 top-2 h-6 w-0.5 rounded-full bg-violet" /> : null}
                        <Icon className={`size-4 ${active ? "text-violet" : ""}`} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="rounded bg-violet/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-violet">{item.badge}</span>
                        ) : null}
                        {item.label === "Notifications" && unreadNotifications > 0 ? (
                          <span className="grid size-5 place-items-center rounded-full bg-violet text-[10px] font-semibold text-white">{unreadNotifications}</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Allowance + balance */}
        <div className="mx-3 mb-3 rounded-xl border border-line bg-[var(--glass-bg)] p-4">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold uppercase tracking-[0.12em] text-text-2">Free allowance</span>
            <span className="font-semibold text-text-0">{allowance.percent.toFixed(1)}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-3">
            <div className="h-full rounded-full bg-gradient-to-r from-violet to-warn" style={{ width: `${Math.min(100, allowance.percent)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-text-2">
            <span>{allowance.usedLabel} used</span><span>{allowance.leftLabel} left</span>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-2">Balance</p>
              <p className="mt-0.5 text-lg font-semibold">{balanceLabel}</p>
            </div>
            <Button asChild size="sm" variant="outline"><Link href="/dashboard/wallet/top-up" prefetch>Top up</Link></Button>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-line px-4 py-3.5">
          <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-violet to-sky-400 text-xs font-semibold text-white">{initials}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-[11px] text-text-2">{user.email}</p>
          </div>
          <ChevronsUpDown className="size-4 text-text-2" />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 items-center justify-between gap-4 border-b border-line px-6">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-text-2">
            <Home className="size-4" /> <span>/</span> <span>Dashboard</span> <span>/</span>
            <span className="font-semibold text-text-0">{current?.label ?? "Overview"}</span>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-xs text-text-1 md:flex">
              <span className="size-1.5 rounded-full bg-success" /> All systems normal
            </span>
            <button type="button" className="hidden items-center gap-3 rounded-lg border border-line bg-[var(--glass-bg)] px-3 py-2 text-xs text-text-1 md:flex">
              <Search className="size-3.5" /> <span className="font-medium text-text-0">Search</span>
              <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
            </button>
            <Link href="/dashboard/notifications" aria-label="Notifications" className="relative text-text-1 hover:text-text-0">
              <Bell className="size-5" />
              {unreadNotifications > 0 ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-danger" /> : null}
            </Link>
            <Button asChild size="sm"><Link href="/dashboard/subscription"><CreditCard className="size-4" /> Upgrade</Link></Button>
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
