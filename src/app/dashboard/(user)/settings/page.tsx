import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { listChatModels } from "@/lib/chat/queries";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const user = await getCurrentUser();
  const [preferences, models] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1).then((rows) => rows[0] ?? null),
    listChatModels(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text-0">Settings</h1>
        {user.totpEnabled ? <Badge variant="accent">2FA enabled</Badge> : null}
      </header>

      <SettingsForms
        name={user.name}
        email={user.email}
        accountId={user.id}
        totpEnabled={user.totpEnabled}
        phone={preferences?.phone ?? ""}
        models={models.map(({ id, name, provider, locked, status }) => ({ id, name, provider, locked, status }))}
        preferences={{
          defaultModel: preferences?.defaultModel ?? "",
          maxOutputTokens: preferences?.maxOutputTokens ?? 8192,
          timezone: preferences?.timezone ?? "UTC",
          notifications: preferences?.notifications ?? { usageAlerts: true, lowBalance: true, paymentReceipts: true, securityAlerts: true, planChanges: true, productUpdates: false },
          usageAlertPercent: preferences?.usageAlertPercent ?? 80,
          lowBalanceCredits: preferences?.lowBalanceCredits ?? 500,
        }}
      />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-56" />
      <Skeleton className="h-56" />
    </div>
  );
}
