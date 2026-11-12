"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CurrencySettings {
  country: string;
  currency: string;
  locale: string;
  rate: number;
  asOf: string | null;
}

const DEFAULT_CURRENCY: CurrencySettings = { country: "IN", currency: "INR", locale: "en-IN", rate: 1, asOf: null };
const CurrencyContext = createContext<CurrencySettings>(DEFAULT_CURRENCY);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_CURRENCY);

  useEffect(() => {
    let active = true;
    const locationHeaders = {
      "x-user-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      "x-user-locale": navigator.languages.join(","),
    };
    void fetch("/api/currency", { cache: "no-store", headers: locationHeaders })
      .then(async (response) => {
        if (!response.ok) throw new Error("Currency lookup failed.");
        return await response.json() as CurrencySettings;
      })
      .then((value) => {
        if (active && value.currency && Number.isFinite(value.rate) && value.rate > 0) setSettings(value);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const value = useMemo(() => settings, [settings]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

export function formatLocalPrice(inrAmount: number, settings: CurrencySettings): string {
  const minorDigits = new Intl.NumberFormat("en", { style: "currency", currency: settings.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const converted = Math.round(inrAmount * settings.rate * (10 ** minorDigits)) / (10 ** minorDigits);
  return new Intl.NumberFormat(settings.locale, {
    style: "currency",
    currency: settings.currency,
    maximumFractionDigits: minorDigits,
    minimumFractionDigits: 0,
  }).format(converted);
}

export function formatMinorCurrency(amountMinor: number, currency: string, locale: string) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(amountMinor / (10 ** digits));
}
