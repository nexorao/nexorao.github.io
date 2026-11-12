import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Reveal } from "@/components/marketing/reveal";
import { ModelCard } from "@/components/models/model-card";
import { listModelCatalog } from "@/lib/models/registry";

const PREVIEW_IDS = ["claude-sonnet-5-5", "gpt-6.1-terra", "claude-haiku-5-5"];

export async function ExplorerPreview() {
  const registry = await listModelCatalog();
  const models = PREVIEW_IDS
    .map((id) => registry.find((model) => model.id === id))
    .filter((model) => model !== undefined);

  return (
    <section className="nx-container py-20 md:py-28">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <SectionHeading
          align="left"
          eyebrow="Model explorer"
          title="Real models, real prices, verified dates"
          description="The registry shows exactly what each model costs, what it can do, and when its details were last checked against provider documentation."
        />
        <Reveal delay={0.1}>
          <Link
            href="/models"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-violet outline-none transition-colors hover:text-violet/80 focus-visible:ring-2 focus-visible:ring-violet/60"
          >
            Browse all models
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </Reveal>
      </div>

      <Reveal className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {models.map((model) => (
          <ModelCard key={model.id} model={model} />
        ))}
      </Reveal>
    </section>
  );
}
