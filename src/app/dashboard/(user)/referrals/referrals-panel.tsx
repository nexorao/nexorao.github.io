"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Gift, Link2, Users } from "lucide-react";
import { applyReferralCodeAction, type ReferralActionState } from "@/app/actions/referrals";
import { formatCredits } from "@/lib/format";

type ReferralRow = { id: string; status: string; rewardCredits: number; createdAt: Date; inviteeName: string };
const initialState: ReferralActionState = {};

export function ReferralsPanel({ code, appUrl, reward, referrals }: { code: string; appUrl: string; reward: number; referrals: ReferralRow[] }) {
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(applyReferralCodeAction, initialState);
  const inviteLink = `${appUrl}/register?ref=${encodeURIComponent(code)}`;
  const rewarded = referrals.filter((item) => item.status === "rewarded");
  const verified = referrals.filter((item) => item.status === "rewarded" || item.status === "verified");
  const earned = rewarded.reduce((sum, item) => sum + Number(item.rewardCredits), 0);
  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  const shareText = encodeURIComponent(`Join me on NEXORAO. Use my invite link: ${inviteLink}`);
  return <div className="flex flex-col gap-4">
    <div className="grid gap-4 xl:grid-cols-[1.9fr_1fr]">
      <section className="glass relative overflow-hidden rounded-2xl border border-line p-6 sm:p-7"><div className="absolute -right-16 -top-24 size-72 rounded-full bg-violet/20 blur-3xl" aria-hidden /><div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg-0/60 px-3 py-1 text-xs font-semibold text-violet"><Gift className="size-3.5" /> {reward ? `${formatCredits(reward)} credits each verified friend` : "Referral rewards paused"}</span>
        <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-text-0 sm:text-4xl">Share your link, grow together.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-1">A friend creates an account with your personal link and verifies their account. You both receive the configured NEXORAO credit reward.</p>
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-bg-0/70 p-3 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-2 px-2 text-sm text-text-2"><Link2 className="size-4 shrink-0" /><span className="truncate font-mono">{inviteLink}</span></div><button type="button" onClick={copyLink} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-text-0 px-4 text-sm font-semibold text-bg-0">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy link"}</button></div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><a className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-text-0 hover:bg-[var(--glass-bg-hover)]" href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer">WhatsApp</a><a className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-text-0 hover:bg-[var(--glass-bg-hover)]" href={`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}`} target="_blank" rel="noreferrer">Telegram</a><a className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-text-0" href={`mailto:?subject=${encodeURIComponent("Join me on NEXORAO")}&body=${shareText}`}>Email</a><span className="ml-auto text-xs text-text-2">Code <strong className="font-mono text-text-0">{code}</strong></span></div>
      </div></section>
      <section className="glass rounded-2xl border border-line p-5"><h2 className="font-semibold text-text-0">How it works</h2><ol className="mt-5 flex flex-col gap-5"><Step number="1" title="Share your link" text="Your invite code is included in the registration link." /><Step number="2" title="Your friend joins" text="The code is attached when a new account is created and verified." /><Step number="3" title="Credits arrive" text={reward ? `${formatCredits(reward)} credits are added to both wallets.` : "Rewards are paused; invite attribution is still recorded."} /></ol></section>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Friends invited" value={String(referrals.length)} note="All time" /><Metric label="Verified" value={String(verified.length)} note={`${referrals.length ? Math.round(verified.length / referrals.length * 100) : 0}% completed`} /><Metric label="Pending reward" value={String(referrals.filter((item) => item.status === "pending").length)} note={reward ? "Awaiting verification" : "Reward currently paused"} /><Metric label="Credits earned" value={formatCredits(earned)} note="Your referral rewards" /></div>

    <section className="glass rounded-2xl border border-line p-5 sm:p-6"><h2 className="text-lg font-semibold text-text-0">Were you invited by a friend?</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-text-1">If you already have an account, enter their code once. New accounts can use the personal invite link above.</p><form action={action} className="mt-4 flex flex-wrap gap-2"><input name="code" maxLength={32} placeholder="NX-XXXXXXXXXXXX" className="h-11 min-w-56 rounded-xl border border-line bg-bg-0 px-3 font-mono text-sm text-text-0 placeholder:text-text-2/60 outline-none focus:border-violet" /><button disabled={pending} className="h-11 rounded-xl bg-text-0 px-4 text-sm font-semibold text-bg-0 disabled:opacity-60">{pending ? "Applying…" : "Apply code"}</button></form>{state.error ? <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p> : null}{state.notice ? <p role="status" className="mt-2 text-sm text-success">{state.notice}</p> : null}</section>

    <section className="glass overflow-hidden rounded-2xl border border-line"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-semibold text-text-0">Your referrals</h2><p className="mt-1 text-xs text-text-2">Only accounts that applied your code appear here.</p></div><span className="flex items-center gap-1.5 text-xs text-success"><span className="size-2 rounded-full bg-success" /> Active</span></div>{referrals.length ? <div className="divide-y divide-line">{referrals.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-violet/10 text-violet"><Users className="size-4" /></span><div><p className="text-sm font-semibold text-text-0">{row.inviteeName}</p><p className="mt-0.5 text-xs text-text-2">Joined {row.createdAt.toLocaleDateString("en-IN")}</p></div></div><div className="text-right"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${row.status === "rewarded" ? "bg-success/10 text-success" : "bg-bg-2 text-text-2"}`}>{row.status === "rewarded" ? "Rewarded" : row.status === "verified" ? "Verified" : "Pending"}</span><p className="mt-1 text-xs text-text-2">{row.rewardCredits ? `+${formatCredits(row.rewardCredits)} credits` : "No reward"}</p></div></div>)}</div> : <div className="px-5 py-10 text-center text-sm text-text-2">No referrals yet. Share your link to invite your first friend.</div>}</section>
  </div>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) { return <li className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-violet/15 font-semibold text-violet">{number}</span><span><span className="block text-sm font-semibold text-text-0">{title}</span><span className="mt-1 block text-xs leading-5 text-text-2">{text}</span></span></li>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <section className="glass rounded-2xl border border-line p-5"><p className="text-xs text-text-2">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-text-0">{value}</p><p className="mt-1.5 text-xs text-text-2">{note}</p></section>; }
