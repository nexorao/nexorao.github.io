"use client";

import Link from "next/link";
import { formatLocalPrice, useCurrency } from "@/components/currency/currency-provider";
import { formatCredits } from "@/lib/format";

type Pack = { id: string; name: string; pricePaise: number; credits: number; bonusCredits: number };

export function WalletPackGrid({ packs }: { packs: Pack[] }) {
  const currency = useCurrency();
  return <div id="top-up" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{packs.slice(0, 5).map((pack) => <div key={pack.id} className="flex flex-col rounded-xl border border-line bg-bg-0/60 p-3"><p className="text-xs font-semibold text-text-0">{pack.name}</p><p className="mt-1 text-sm font-semibold text-violet">{formatLocalPrice(pack.pricePaise / 100, currency)}</p><p className="mb-3 mt-1 text-[10px] text-text-2">{formatCredits(pack.credits + pack.bonusCredits)} credits</p><Link href={`/checkout/start?kind=topup&pack=${encodeURIComponent(pack.id)}`} className="mt-auto inline-flex h-9 items-center justify-center rounded-lg border border-line px-2 text-xs font-semibold text-text-0 transition-colors hover:bg-[var(--glass-bg-hover)]">Add credits</Link></div>)}</div>;
}
