"use client";

import { formatLocalPrice, useCurrency } from "@/components/currency/currency-provider";

export function LocalizedCheckoutPrice({ inrAmount }: { inrAmount: number }) {
  const currency = useCurrency();
  return <p className="text-xl font-semibold tabular-nums text-text-0">{formatLocalPrice(inrAmount, currency)}</p>;
}
