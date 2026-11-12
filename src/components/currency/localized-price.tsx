"use client";

import { formatLocalPrice, useCurrency } from "@/components/currency/currency-provider";

export function LocalizedPrice({ inrAmount, className }: { inrAmount: number; className?: string }) {
  const currency = useCurrency();
  return <span className={className}>{formatLocalPrice(inrAmount, currency)}</span>;
}
