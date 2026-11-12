/**
 * Platform settings: typed defaults + descriptions. PURE module (no DB, no
 * server-only) so scripts and tests can import it — the DB-backed accessor
 * lives in lib/settings.ts.
 */
export interface PlatformSettings {
  /** 1 credit = creditValuePaise paise (₹0.01 default, spec §6). */
  creditValuePaise: number;
  /** USD→INR display assumption — an assumption, not a live FX feed. */
  fxInrPerUsd: number;
  /** Default markup when a model does not define its own. */
  defaultMarkupPct: number;
  /** Consumption order (spec §6): configurable bucket priority. */
  consumptionOrder: string[];
  /** Minimum charge for any billable request. */
  minChargeCredits: number;
  /** Low-balance alert threshold for in-app and email notifications. */
  lowBalanceAlertCredits: number;
  /** How long an unpaid reservation may sit before the reconciler expires it. */
  reservationTtlMinutes: number;
  /** Login/session lifetime in days. */
  sessionTtlDays: number;
  /** Daily free bucket expiry: end of the UTC calendar day. */
  dailyFreeWindow: "utc-day";
}

export const SETTINGS_DEFAULTS: PlatformSettings = {
  creditValuePaise: 1,
  fxInrPerUsd: 90,
  defaultMarkupPct: 15,
  consumptionOrder: ["daily_free", "promotional", "subscription", "purchased"],
  minChargeCredits: 1,
  lowBalanceAlertCredits: 200,
  reservationTtlMinutes: 10,
  sessionTtlDays: 30,
  dailyFreeWindow: "utc-day",
};

export const SETTINGS_DESCRIPTIONS: Record<keyof PlatformSettings, string> = {
  creditValuePaise: "Paise per credit. Credits = ceil(billed paise / this value).",
  fxInrPerUsd: "USD→INR assumption for estimates only; not a live FX feed.",
  defaultMarkupPct: "Platform markup applied when a model has no per-model markup.",
  consumptionOrder: "Bucket consumption order for debits.",
  minChargeCredits: "Minimum credits charged for any billable request.",
  lowBalanceAlertCredits: "Wallet balance below this triggers low-balance alerts.",
  reservationTtlMinutes: "Unsettled reservations older than this are expired by the reconciler.",
  sessionTtlDays: "Login session lifetime in days.",
  dailyFreeWindow: "Window used to reset the daily free allowance.",
};

const EDITABLE_KEYS = new Set<keyof PlatformSettings>([
  "creditValuePaise",
  "fxInrPerUsd",
  "defaultMarkupPct",
  "minChargeCredits",
  "lowBalanceAlertCredits",
  "reservationTtlMinutes",
  "sessionTtlDays",
]);

export function isEditableSetting(key: string): key is keyof PlatformSettings {
  return EDITABLE_KEYS.has(key as keyof PlatformSettings);
}
