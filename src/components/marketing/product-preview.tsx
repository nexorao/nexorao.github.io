"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Paperclip, SendHorizonal } from "lucide-react";
import { EASE_OUT_EXPO } from "@/components/marketing/reveal";

/**
 * Illustrative product UI mockup (master spec §17 — "product UI preview,
 * no fake metrics"). All values are sample data and labeled as such.
 */
export function ProductPreview() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mx-auto max-w-4xl px-4 sm:px-0">
      <div
        aria-hidden
        className="glow-soft left-1/2 top-8 h-64 w-[72%] -translate-x-1/2"
      />
      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.05, ease: EASE_OUT_EXPO }}
        className="glass glass-edge relative overflow-hidden rounded-xl text-left"
      >
        <div aria-hidden className="noise absolute inset-0 rounded-xl" />

        {/* Window chrome */}
        <div className="relative flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--line-strong)]" />
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--line-strong)]" />
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--line-strong)]" />
          <span className="mx-auto rounded-sm border border-line bg-[var(--glass-bg)] px-2.5 py-0.5 font-mono text-[11px] text-text-2">
            nexora.ai/chat
          </span>
          <span aria-hidden className="w-14" />
        </div>

        <div className="relative grid grid-cols-1 sm:grid-cols-[160px_1fr] lg:grid-cols-[170px_1fr_190px]">
          {/* Conversation list */}
          <aside className="hidden flex-col gap-1 border-r border-line p-3 sm:flex">
            <div className="glass-interactive mb-2 flex items-center justify-center gap-1.5 rounded-md border border-line px-2 py-2 text-xs font-medium text-text-0">
              + New chat
            </div>
            {[
              { title: "Lease summary — action items", active: true },
              { title: "Changelog → release notes", active: false },
              { title: "Debug: Prisma migration", active: false },
              { title: "Onboarding email draft", active: false },
              { title: "Compare: Sol vs Sonnet", active: false },
            ].map((conv) => (
              <div
                key={conv.title}
                className={
                  conv.active
                    ? "truncate rounded-md bg-[var(--glass-bg-hover)] px-2.5 py-2 text-xs text-text-0"
                    : "truncate rounded-md px-2.5 py-2 text-xs text-text-2"
                }
              >
                {conv.title}
              </div>
            ))}
            <div className="mt-auto rounded-md border border-line px-2.5 py-2 text-[11px] text-text-2">
              <span className="font-medium text-text-1">Wallet</span>
              <br />
              36,300 credits
            </div>
          </aside>

          {/* Chat pane */}
          <div className="flex min-h-[22rem] flex-col gap-4 p-4 md:p-5">
            <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-bg-3 px-3.5 py-2.5 text-[13px] leading-relaxed text-text-0">
              Summarize this 40-page lease PDF and list the action items with
              deadlines.
              <span className="mt-1.5 flex items-center gap-1 text-[11px] text-text-2">
                <Paperclip className="size-3" aria-hidden />
                lease-agreement.pdf
              </span>
            </div>

            <div className="mr-auto max-w-[90%] rounded-lg rounded-bl-sm border border-line bg-[var(--glass-bg)] px-3.5 py-3 text-[13px] leading-relaxed text-text-1">
              <p className="font-medium text-text-0">Key terms extracted</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li>Rent ₹42,000/month, due on the 5th</li>
                <li>Security deposit: 2 months, refundable in 30 days</li>
                <li>Notice period: 60 days before vacating</li>
              </ul>
              <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-sm border border-line bg-[var(--glass-bg)] px-1.5 py-0.5 font-mono text-text-2">
                  claude-sonnet-5-5
                </span>
                <span className="rounded-sm border border-line px-1.5 py-0.5 text-text-2">
                  1,248 in · 356 out
                </span>
                <span className="rounded-sm border border-line px-1.5 py-0.5 text-violet">
                  84 credits
                </span>
              </div>
            </div>

            <div className="mt-auto flex items-center gap-2 rounded-lg border border-line bg-[var(--glass-bg)] px-3 py-2.5 text-xs text-text-2">
              <span className="flex-1">Ask anything, or switch models with ⌘K…</span>
              <SendHorizonal className="size-4 text-text-2" aria-hidden />
            </div>
          </div>

          {/* Right rail */}
          <aside className="hidden flex-col gap-3 border-l border-line p-3 lg:flex">
            <div className="rounded-lg border border-line bg-[var(--glass-bg)] p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-2">
                Credits
              </p>
              <p className="mt-1 text-lg font-semibold text-text-0">36,300</p>
              <div className="mt-2 space-y-1 text-[11px] text-text-2">
                <div className="flex justify-between">
                  <span>Daily free</span>
                  <span className="text-text-1">100</span>
                </div>
                <div className="flex justify-between">
                  <span>Promotional</span>
                  <span className="text-text-1">1,500</span>
                </div>
                <div className="flex justify-between">
                  <span>Subscription</span>
                  <span className="text-text-1">24,800</span>
                </div>
                <div className="flex justify-between">
                  <span>Purchased</span>
                  <span className="text-text-1">9,900</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-[var(--glass-bg)] p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-2">
                Model costs
              </p>
              <ul className="mt-2 space-y-1.5 font-mono text-[11px] text-text-1">
                <li className="flex justify-between gap-2">
                  <span className="truncate">claude-sonnet-5-5</span>
                  <span className="text-text-2">20.7k/1M in</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="truncate">gpt-6.1-terra</span>
                  <span className="text-text-2">10.4k/1M in</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="truncate">gpt-6-luna</span>
                  <span className="text-text-2">1.0k/1M in</span>
                </li>
              </ul>
              <p className="mt-2 text-[10px] text-text-2">
                Estimated credits per 1M input tokens
              </p>
            </div>
          </aside>
        </div>
      </motion.div>

      <p className="mt-3 text-center text-[11px] text-text-2">
        Illustrative interface preview — sample data, not live balances or
        responses.
      </p>
    </div>
  );
}
