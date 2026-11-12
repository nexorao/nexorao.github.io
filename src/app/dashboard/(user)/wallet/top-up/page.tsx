import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { BalanceTopupButton } from "@/app/dashboard/balance-topup-modal";

export const metadata: Metadata = { title: "Add balance" };

export default function WalletTopUpPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link href="/dashboard/wallet" prefetch className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-2 transition-colors hover:text-text-0">
        <ArrowLeft className="size-4" /> Back to wallet
      </Link>
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-success/20 bg-success/10 text-success"><ShieldCheck className="size-5" /></span>
        <div><h1 className="text-2xl font-semibold tracking-tight text-text-0">Add balance</h1><p className="mt-1 text-sm text-text-2">Choose an amount and pay securely through Razorpay.</p></div>
      </header>
      <BalanceTopupButton autoOpen hideTrigger pageMode />
    </div>
  );
}
