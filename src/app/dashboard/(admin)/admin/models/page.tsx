import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { plans, providers } from "@/db/schema";
import { listRegistryModels } from "@/lib/models/registry";
import { RegistryPanel } from "./registry-panel";

export const metadata: Metadata = { title: "Admin · Model registry" };

export default function AdminModelsPage() {
  return (
    <Suspense fallback={<RegistrySkeleton />}>
      <RegistryContent />
    </Suspense>
  );
}

async function RegistryContent() {
  const [models, providerRows, planRows] = await Promise.all([
    listRegistryModels(),
    db.select({ id: providers.id, slug: providers.slug, name: providers.name }).from(providers).orderBy(providers.name),
    db.select({ id: plans.id, name: plans.name }).from(plans).orderBy(plans.sortOrder),
  ]);
  return <RegistryPanel models={models} providers={providerRows} plans={planRows} />;
}

function RegistrySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-9 w-64" />
      {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20" />)}
    </div>
  );
}
