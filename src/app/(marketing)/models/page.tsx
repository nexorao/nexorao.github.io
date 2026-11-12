import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { MODELS, type ModelEntry } from "@/data/models";
import { ModelExplorer } from "@/components/models/model-explorer";
import { listModelCatalog } from "@/lib/models/registry";

export const metadata: Metadata = {
  title: "Models",
  description:
    "Explore the NEXORAO model registry: Claude, GPT, Gemini and open-source models with verified pricing, context windows and credit estimates.",
};

export default function ModelsPage() {
  return <Suspense fallback={<ModelPageSkeleton />}><ModelCatalog /></Suspense>;
}

async function ModelCatalog() {
  let models: ModelEntry[];
  try {
    models = await listModelCatalog();
  } catch {
    // Static/preview builds have no database — fall back to the bundled catalog.
    models = MODELS.filter((model) => model.status !== "deprecated");
  }
  const providers = new Set(models.map((model) => model.provider));
  const maxContext = Math.max(0, ...models.map((model) => model.contextWindow ?? 0));
  const minimumInputPrice = models.reduce<number | null>((lowest, model) => {
    const price = model.pricing?.inputUsdPerMTok;
    return price === undefined || price === null ? lowest : lowest === null ? price : Math.min(lowest, price);
  }, null);

  return <>
    <section className="relative overflow-hidden border-b border-line bg-bg-0">
      <div className="absolute inset-0 bg-grid-faint opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden />
      <div className="glow-soft left-[8%] top-10 size-[28rem] opacity-50" aria-hidden />
      <div className="glow-soft right-[3%] top-8 size-[24rem] bg-cyan-400/15" aria-hidden />
      <div className="nx-container relative py-14 md:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet">— Model catalog</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-text-0 md:text-5xl">
          {models.length} models. <span className="font-serif font-normal italic text-violet">One endpoint.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-text-1">
          Every model in one place. Filter by provider and capability, compare context windows, and see the live registry pricing before you build.
        </p>
        <div className="mt-7 flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1.5 text-success">● {models.length} active</span>
          <span className="rounded-full border border-line bg-bg-1 px-3 py-1.5 text-text-1">{providers.size} providers</span>
          <span className="rounded-full border border-line bg-bg-1 px-3 py-1.5 text-text-1">Up to {Intl.NumberFormat("en", { notation: "compact" }).format(maxContext)} context</span>
          {minimumInputPrice !== null ? <span className="rounded-full border border-line bg-bg-1 px-3 py-1.5 text-text-1">From ${minimumInputPrice.toFixed(3)} / 1M input</span> : null}
        </div>
      </div>
    </section>
    <section className="nx-container pb-24 pt-6"><ModelExplorer models={models} /></section>
  </>;
}

function ModelPageSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-72 w-full rounded-none" />
      <div className="nx-container flex flex-col gap-4 py-8"><Skeleton className="h-12 w-full" /><Skeleton className="h-8 w-2/3" /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-80" />)}</div></div>
    </div>
  );
}
