"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PLANS } from "@/data/plans";
import { formatCredits } from "@/lib/format";
import { formatLocalPrice, useCurrency } from "@/components/currency/currency-provider";
import { cn } from "@/lib/utils";

export function PricingTable() {
  const [annual, setAnnual] = React.useState(false);
  const currency = useCurrency();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span
          className={cn(
            "text-sm transition-colors",
            annual ? "text-text-2" : "font-medium text-text-0",
          )}
        >
          Monthly
        </span>
        <Switch
          checked={annual}
          onCheckedChange={setAnnual}
          aria-label="Toggle annual billing"
        />
        <span
          className={cn(
            "text-sm transition-colors",
            annual ? "font-medium text-text-0" : "text-text-2",
          )}
        >
          Annual
        </span>
        <Badge variant="success">2 months free</Badge>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {PLANS.map((plan) => {
          const isFree = plan.priceInrMonthly === 0;
          const annualTotal = plan.priceInrMonthly * plan.annualMonthsCharged;
          const monthlyEquivalent = Math.round(annualTotal / 12);

          return (
            <article
              key={plan.id}
              className={cn(
                "glass glass-interactive relative flex h-full flex-col gap-5 rounded-xl p-5 hover:-translate-y-0.5",
                plan.popular && "ring-1 ring-violet/50",
              )}
            >
              {plan.popular ? (
                <Badge
                  variant="accent"
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2"
                >
                  Most popular
                </Badge>
              ) : null}

              <div>
                <h3 className="text-sm font-semibold text-text-0">{plan.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-text-2">
                  {plan.tagline}
                </p>
              </div>

              <div>
                {isFree ? (
                  <p className="text-2xl font-semibold text-text-0">Free</p>
                ) : annual ? (
                  <p className="text-2xl font-semibold text-text-0">
                    {formatLocalPrice(monthlyEquivalent, currency)}
                    <span className="text-sm font-normal text-text-2"> /mo</span>
                  </p>
                ) : (
                  <p className="text-2xl font-semibold text-text-0">
                    {formatLocalPrice(plan.priceInrMonthly, currency)}
                    <span className="text-sm font-normal text-text-2"> /mo</span>
                  </p>
                )}
                <p className="mt-1 text-[11px] text-text-2">
                  {isFree
                    ? "No card required"
                    : annual
                      ? `${formatLocalPrice(annualTotal, currency)} billed annually`
                      : "Billed monthly"}
                </p>
              </div>

              <div className="rounded-md border border-line bg-[var(--glass-bg)] px-3 py-2 text-xs">
                {isFree ? (
                  <span className="text-text-1">
                    <span className="font-semibold text-text-0">
                      {formatCredits(plan.dailyFreeCredits)} credits
                    </span>{" "}
                    every day
                  </span>
                ) : (
                  <span className="text-text-1">
                    <span className="font-semibold text-text-0">
                      {formatCredits(plan.monthlyCredits)} credits
                    </span>{" "}
                    per month
                  </span>
                )}
              </div>

              <ul className="flex flex-1 flex-col gap-2 text-xs text-text-1">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-success"
                      aria-hidden
                    />
                    {highlight}
                  </li>
                ))}
              </ul>

              {isFree ? (
                <Button variant={plan.popular ? "primary" : "glass"} asChild>
                  <Link href="/register">Start free</Link>
                </Button>
              ) : (
                <Button variant={plan.popular ? "primary" : "glass"} asChild>
                  <Link href={`/checkout/start?kind=subscription&plan=${encodeURIComponent(plan.id)}&cycle=${annual ? "annual" : "monthly"}`}>
                    Choose {plan.name}
                  </Link>
                </Button>
              )}
            </article>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-text-2">
        Proposed launch pricing. Credits, limits, eligibility and annual
        discounts may evolve with usage — plans never include unlimited access
        to expensive models.
      </p>
    </div>
  );
}
