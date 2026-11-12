import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveSubscription, getPlan } from "@/lib/subscriptions";
import { ensureDailyGrant, getOrCreateWallet, listActiveBuckets } from "@/lib/wallet";
import { logoutAction } from "@/app/actions/auth";
import { NavLinks } from "./nav-links";
import { Button } from "@/components/ui/button";

export async function DashboardNav() {
  await connection();
  const user = await getSessionUser();
  if (!user) {
    return (
      <>
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[255px] border-r border-line bg-bg-1 lg:flex lg:flex-col">
          <Brand plan="" />
          <div className="m-3 rounded-xl border border-line bg-[var(--glass-bg)] p-4 text-sm text-text-1">
            <p className="mb-3">Sign in to open your workspace.</p>
            <Button asChild size="sm" className="w-full"><Link href="/login">Sign in</Link></Button>
          </div>
        </aside>
        <div className="border-b border-line bg-bg-1 px-4 py-3 lg:hidden"><Brand plan="" /></div>
      </>
    );
  }

  await ensureDailyGrant(user.id);
  const [subscription, wallet] = await Promise.all([
    getActiveSubscription(user.id),
    getOrCreateWallet(user.id),
  ]);
  const [plan, buckets] = await Promise.all([
    getPlan(subscription?.planId ?? "free"),
    listActiveBuckets(wallet.id),
  ]);
  const dailyTotal = buckets.filter((bucket) => bucket.type === "daily_free")
    .reduce((sum, bucket) => sum + Number(bucket.credits), 0);
  const balance = buckets.reduce((sum, bucket) => sum + Number(bucket.credits), 0);
  const allowance = Number(plan?.dailyFreeCredits ?? 0);
  const usedToday = Math.max(0, allowance - dailyTotal);
  const allowancePercent = allowance ? Math.min(100, Math.round((usedToday / allowance) * 100)) : 0;

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[255px] flex-col border-r border-line bg-bg-1 lg:flex">
        <Brand plan={plan?.name ?? "Free"} />
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
          <NavLinks isAdmin={user.isAdmin} />
        </div>
        <div className="border-t border-line p-2.5">
          <div className="rounded-xl border border-line bg-bg-0/70 p-3">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.13em] text-text-2">
              <span>Daily free</span><span>{allowancePercent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-3">
              <div className="h-full rounded-full bg-grad-accent" style={{ width: `${allowancePercent}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-text-2">
              <span>{dailyTotal.toLocaleString("en-IN")} credits left</span><span>UTC reset</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <div><p className="text-[10px] text-text-2">Balance</p><p className="mt-0.5 text-sm font-semibold tabular-nums text-text-0">{balance.toLocaleString("en-IN")}</p></div>
              <Button asChild variant="outline" size="sm"><Link href="/dashboard/wallet/top-up" prefetch>Top up</Link></Button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl px-2 py-2 hover:bg-[var(--glass-bg)]">
            <Link href="/dashboard/settings" className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-grad-accent text-[10px] font-semibold text-white">{user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
              <span className="min-w-0"><span className="block truncate text-xs font-semibold text-text-0">{user.name}</span><span className="block truncate text-[10px] text-text-2">{user.email}</span></span>
            </Link>
            <form action={logoutAction}><button type="submit" aria-label="Sign out" className="rounded-md px-2 py-1 text-text-2 hover:bg-[var(--glass-bg-hover)] hover:text-text-0">↗</button></form>
          </div>
        </div>
      </aside>
      <div className="border-b border-line bg-bg-1 px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-3"><Brand plan={plan?.name ?? "Free"} /><form action={logoutAction}><button type="submit" className="text-xs text-text-2">Sign out</button></form></div>
        <div className="mt-3 overflow-x-auto"><NavLinks isAdmin={user.isAdmin} compact /></div>
      </div>
    </>
  );
}

function Brand({ plan }: { plan: string }) {
  return (
    <Link href="/dashboard" className="flex h-[58px] items-center justify-between border-b border-line px-4">
      <span className="flex items-center gap-2.5">
        <Image src="/brand/nexora-mark.webp" alt="" aria-hidden width={512} height={512} className="size-8 shrink-0 rounded-lg object-cover" />
        <span className="font-serif text-[15px] font-semibold tracking-[0.16em] text-text-0">NEXORAO</span>
      </span>
      {plan ? <span className="rounded-md bg-violet/10 px-2 py-1 text-[10px] font-semibold text-violet">{plan}</span> : null}
    </Link>
  );
}
