import Link from "next/link";
import { ArrowRight, CircleCheck, Wallet } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Reveal } from "@/components/marketing/reveal";

const FORMULA = `# Cost of a single request (computed server-side)
provider_cost = input_tokens  × input_price
              + output_tokens × output_price
              + cached_tokens × cached_price
              + reasoning_tokens × reasoning_price
              + tool_fees + image_fees

billed  = provider_cost × (1 + markup_pct)   # + minimum charge
credits = ceil(billed / credit_value)        # 1 credit = ₹0.01`;

const STEPS = [
  {
    title: "Estimate and reserve",
    description:
      "Before the provider is called, the worst-case cost is reserved inside a database transaction with row locking — no race conditions, no negative balances.",
  },
  {
    title: "Run the request",
    description:
      "The provider adapter streams the response. Usage tokens (input, output, cached, reasoning) are normalized into one usage object.",
  },
  {
    title: "Commit the actual cost",
    description:
      "Real usage replaces the estimate. Unused reservation is released instantly and the append-only ledger records the exact charge.",
  },
  {
    title: "Failures refund themselves",
    description:
      "If a request fails or is stopped, the reservation is released — unless tokens were genuinely consumed, in which case only the actual cost is charged.",
  },
];

const BUCKETS = [
  { name: "Daily free", note: "resets every day" },
  { name: "Promotional", note: "nearest expiry first" },
  { name: "Subscription", note: "per billing cycle" },
  { name: "Purchased", note: "longest validity" },
];

export function HowCreditsWork() {
  return (
    <section
      id="credits"
      className="border-y border-line"
      style={{ background: "color-mix(in srgb, var(--bg-1) 45%, transparent)" }}
    >
      <div className="nx-container py-20 md:py-28">
        <SectionHeading
          eyebrow="Credits"
          title="How credits work"
          description="No mystery pricing. Every request is priced from provider list rates plus a visible markup, charged atomically, and shown to you before and after."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <Reveal>
            <ol className="flex flex-col gap-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-grad-accent text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-text-0">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-1">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="glass mt-8 rounded-xl p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-0">
                <Wallet className="size-4 text-violet" aria-hidden />
                Consumption order
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {BUCKETS.map((bucket, index) => (
                  <span key={bucket.name} className="flex items-center gap-2">
                    <span className="rounded-full border border-line bg-[var(--glass-bg)] px-2.5 py-1 text-text-1">
                      {bucket.name}
                      <span className="ml-1.5 text-[10px] text-text-2">
                        {bucket.note}
                      </span>
                    </span>
                    {index < BUCKETS.length - 1 ? (
                      <ArrowRight className="size-3 text-text-2" aria-hidden />
                    ) : null}
                  </span>
                ))}
              </div>
              <ul className="mt-4 space-y-1.5 text-xs text-text-2">
                <li className="flex items-center gap-1.5">
                  <CircleCheck className="size-3.5 text-success" aria-hidden />
                  Idempotency keys prevent double charging.
                </li>
                <li className="flex items-center gap-1.5">
                  <CircleCheck className="size-3.5 text-success" aria-hidden />
                  Low-balance alerts at configurable thresholds.
                </li>
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <CodeBlock code={FORMULA} language="formula" title="pricing engine" />
            <p className="mt-4 text-xs leading-relaxed text-text-2">
              Every parameter above — markup, credit value, per-model prices,
              minimum charge — is reflected in the displayed estimate. The same
              math powers the{" "}
              <Link
                href="/pricing#calculator"
                className="text-violet underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-violet/60"
              >
                public pricing calculator
              </Link>
              .
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
