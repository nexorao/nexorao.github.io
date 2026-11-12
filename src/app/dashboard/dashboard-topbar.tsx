"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const LABELS: Record<string, string> = {
  dashboard: "Overview",
  chat: "Playground",
  "api-keys": "API keys",
  usage: "Usage & logs",
  models: "Models",
  subscription: "Plans",
  wallet: "Balance & top-up",
  referrals: "Rewards",
  settings: "Settings",
  notifications: "Notifications",
  support: "Support",
  feedback: "Feedback",
  admin: "Admin",
  providers: "Providers",
  audit: "Audit log",
};

export function DashboardTopbar() {
  const pathname = usePathname();
  const crumbs = pathname.split("/").filter(Boolean).map((segment, index, all) => ({
    label: LABELS[segment] ?? segment,
    href: `/${all.slice(0, index + 1).join("/")}`,
    current: index === all.length - 1,
  }));
  if (crumbs[0]?.label === "Overview") crumbs.shift();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg-0/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[58px] max-w-[1510px] items-center justify-between gap-3 px-4 md:px-7">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-xs">
          <Link href="/dashboard" className="shrink-0 text-text-2 hover:text-text-0">⌂</Link>
          {crumbs.map((crumb) => (
            <span key={crumb.href} className="flex min-w-0 items-center gap-2">
              <ChevronRight className="size-3 shrink-0 text-text-2" />
              {crumb.current
                ? <span aria-current="page" className="truncate font-semibold text-text-0">{crumb.label}</span>
                : <Link href={crumb.href} className="truncate text-text-2 hover:text-text-0">{crumb.label}</Link>}
            </span>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 text-[11px] text-emerald-400 md:inline-flex"><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.6)]" /> Workspace online</span>
          <Button asChild variant="outline" size="sm" className="h-8 gap-2 px-2.5">
            <Link href="/models"><Search className="size-3.5" /><span className="hidden sm:inline">Search</span><kbd className="hidden rounded border border-line px-1 py-0.5 text-[9px] text-text-2 sm:inline">Ctrl K</kbd></Link>
          </Button>
          <Link href="/dashboard/notifications" aria-label="Notifications" className="grid size-8 place-items-center rounded-lg text-text-2 hover:bg-[var(--glass-bg)] hover:text-text-0"><Bell className="size-4" /></Link>
          <ThemeToggle />
          <Button asChild size="sm" className="hidden sm:inline-flex"><Link href="/dashboard/subscription">Upgrade</Link></Button>
        </div>
      </div>
    </header>
  );
}
