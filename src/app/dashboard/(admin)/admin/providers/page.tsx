import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { listAdminProviders } from "@/lib/providers/registry";
import { ProvidersPanel } from "./providers-panel";

export const metadata: Metadata = { title: "Admin · Providers" };

export default function AdminProvidersPage() {
  return (
    <Suspense fallback={<ProvidersSkeleton />}>
      <ProvidersContent />
    </Suspense>
  );
}

async function ProvidersContent() {
  const providers = await listAdminProviders();
  return <ProvidersPanel providers={providers} />;
}

function ProvidersSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-9 w-52" />
      {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-56" />)}
    </div>
  );
}
