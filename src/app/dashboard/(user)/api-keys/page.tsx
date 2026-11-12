import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { listApiKeys } from "@/lib/api-keys";
import { site } from "@/lib/site";
import { ApiKeysPanel } from "./api-keys-panel";

export const metadata: Metadata = { title: "API keys" };

export default function ApiKeysPage() {
  return <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-12" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>}><ApiKeysContent /></Suspense>;
}

async function ApiKeysContent() {
  const user = await getCurrentUser();
  const keys = await listApiKeys(user.id);
  return <ApiKeysPanel keys={keys} appUrl={site.url.replace(/\/$/, "")} />;
}
