import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WalletTransaction } from "@/db/schema";

/** Small glass stat tile used across dashboard + admin. */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "warn";
}) {
  return (
    <Card className="glass p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-2">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tracking-tight",
          tone === "accent" && "text-violet",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-text-2">{hint}</p> : null}
    </Card>
  );
}

export const BUCKET_LABELS: Record<string, string> = {
  daily_free: "Daily free",
  promotional: "Promotional",
  subscription: "Subscription",
  purchased: "Purchased",
};

export const TX_LABELS: Record<string, string> = {
  daily_grant: "Daily free credits",
  subscription_grant: "Subscription allowance",
  purchase: "Top-up purchase",
  promotional_grant: "Promotional grant",
  reservation_hold: "Hold (request reserved)",
  reservation_release: "Release (unused refunded)",
  admin_grant: "Admin grant",
  admin_deduct: "Admin adjustment",
  expiry: "Expired",
  adjustment: "Adjustment",
};

function formatWhen(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Ledger rows — signed amounts, UTC times. */
export function TransactionsTable({
  transactions,
  limit,
}: {
  transactions: WalletTransaction[];
  limit?: number;
}) {
  const rows = limit ? transactions.slice(0, limit) : transactions;
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-text-2">No transactions yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-text-2">
            <th className="py-2 pr-3 font-medium">When (UTC)</th>
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 text-right font-medium">Amount</th>
            <th className="py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => (
            <tr key={tx.id} className="border-b border-line/50 last:border-0">
              <td className="py-2.5 pr-3 whitespace-nowrap text-text-1">
                {formatWhen(tx.createdAt)}
              </td>
              <td className="py-2.5 pr-3 text-text-1">
                {TX_LABELS[tx.type] ?? tx.type}
              </td>
              <td
                className={cn(
                  "py-2.5 pr-3 text-right font-mono tabular-nums",
                  tx.amount >= 0 ? "text-success" : "text-danger",
                )}
              >
                {tx.amount >= 0 ? "+" : ""}
                {tx.amount.toLocaleString("en-IN")}
              </td>
              <td className="py-2.5 text-right font-mono tabular-nums text-text-1">
                {tx.balanceAfter.toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
