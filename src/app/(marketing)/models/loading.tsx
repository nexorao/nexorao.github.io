import { Skeleton } from "@/components/ui/skeleton";

export default function ModelsLoading() {
  return <div aria-hidden><Skeleton className="h-72 w-full rounded-none" /><div className="nx-container space-y-5 py-8"><Skeleton className="h-12 w-full" /><Skeleton className="h-8 w-2/3" /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-80" />)}</div></div></div>;
}
