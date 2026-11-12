"use client";

import * as React from "react";
import { ChevronDown, Info } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODELS, getModel, type ModelEntry } from "@/data/models";
import { CREDIT_VALUE_PAISE, estimateCredits, fxInrPerUsd } from "@/lib/credits";
import { formatCredits, formatUsd } from "@/lib/format";
import { formatLocalPrice, useCurrency } from "@/components/currency/currency-provider";
import { cn } from "@/lib/utils";

const TOKEN_PRESETS = [1_000, 10_000, 50_000, 100_000];

const CALCULABLE = MODELS.filter((m) => m.pricing !== null);

function TokenField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-text-2">{label}</label>
      <Input
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
        className="mt-1.5"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TOKEN_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-violet/60",
              value === preset
                ? "border-violet/50 bg-violet/10 text-violet"
                : "border-line text-text-2 hover:border-line-strong hover:text-text-0",
            )}
          >
            {preset >= 1000 ? `${preset / 1000}k` : preset}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PricingCalculator() {
  const [modelId, setModelId] = React.useState("claude-sonnet-5-5");
  const [inputTokens, setInputTokens] = React.useState(1_000);
  const [outputTokens, setOutputTokens] = React.useState(500);
  const currency = useCurrency();

  const model = getModel(modelId) as ModelEntry;
  const fx = fxInrPerUsd();
  const estimate = model.pricing
    ? estimateCredits(model, inputTokens, outputTokens, fx)
    : null;

  const rupeeEquivalent = estimate
    ? (estimate.credits * CREDIT_VALUE_PAISE) / 100
    : 0;

  return (
    <Card id="calculator" className="scroll-mt-24 p-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-text-0">Pricing calculator</h3>
        <p className="text-sm text-text-2">
          Estimate the credit cost of a request before you send it.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Controls */}
        <div className="flex flex-col gap-5">
          <div>
            <label className="text-xs font-medium text-text-2">Model</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="mt-1.5 w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {model.name}
                    <span className="ml-2 font-mono text-xs text-text-2">
                      {model.id}
                    </span>
                  </span>
                  <ChevronDown className="size-4 text-text-2" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
                {CALCULABLE.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    onSelect={() => setModelId(m.id)}
                    className={cn(m.id === modelId && "text-text-0")}
                  >
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="font-mono text-[11px] text-text-2">
                      ${m.pricing!.inputUsdPerMTok}/${m.pricing!.outputUsdPerMTok}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <TokenField
              label="Input tokens"
              value={inputTokens}
              onChange={setInputTokens}
            />
            <TokenField
              label="Output tokens"
              value={outputTokens}
              onChange={setOutputTokens}
            />
          </div>
        </div>

        {/* Result */}
        <div className="glass rounded-lg p-5">
          {estimate ? (
            <>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-2">
                    Estimated cost
                  </p>
                  <p className="mt-1 text-3xl font-semibold text-text-0">
                    <AnimatedNumber value={estimate.credits} format={formatCredits} />
                    <span className="ml-2 text-sm font-normal text-text-2">
                      credits
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-text-2">
                    ≈ {formatLocalPrice(rupeeEquivalent, currency)} at base rate 1 credit = ₹
                    {(CREDIT_VALUE_PAISE / 100).toFixed(2)}
                  </p>
                </div>
                <span className="rounded-full border border-line bg-[var(--glass-bg)] px-2.5 py-1 font-mono text-[11px] text-text-1">
                  {model.id}
                </span>
              </div>

              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-text-2">Provider list price</dt>
                  <dd className="font-mono text-text-1">
                    {formatUsd(estimate.providerCostUsd)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-text-2">× FX assumption (₹{fx}/USD)</dt>
                  <dd className="font-mono text-text-1">
                    {formatLocalPrice(estimate.providerCostInr, currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-text-2">
                    × platform markup ({model.markupPct}%)
                  </dt>
                  <dd className="font-mono text-text-0">
                    {formatLocalPrice(estimate.billedInr, currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-text-2">Minimum charge</dt>
                  <dd className="font-mono text-text-1">1 credit</dd>
                </div>
              </dl>

              <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-text-2">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                Estimates use last-verified list prices and a configurable FX
                assumption for display only. Actual billing is always computed
                server-side at request time — browser-computed costs are never
                trusted.
              </p>
            </>
          ) : (
            <p className="text-sm text-text-1">
              This model has host-dependent pricing. The calculator unlocks
              once verified provider rates are available.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
