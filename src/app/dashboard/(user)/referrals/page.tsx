import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureReferralCode, listUserReferrals, referralRewardCredits } from "@/lib/referrals";
import { site } from "@/lib/site";
import { ReferralsPanel } from "./referrals-panel";

export const metadata: Metadata = { title: "Rewards" };

export default function ReferralsPage() {
  return <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-72" /><Skeleton className="h-28" /><Skeleton className="h-56" /></div>}><ReferralsContent /></Suspense>;
}

async function ReferralsContent() {
  const user = await getCurrentUser();
  const [code, referrals] = await Promise.all([ensureReferralCode(user.id), listUserReferrals(user.id)]);
  return <ReferralsPanel code={code} appUrl={site.url.replace(/\/$/, "")} reward={referralRewardCredits()} referrals={referrals} />;
}
