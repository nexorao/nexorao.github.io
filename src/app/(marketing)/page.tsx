import { Suspense } from "react";
import { Hero } from "@/components/marketing/hero";
import { ModelShowcase, ModelShowcaseFallback } from "@/components/marketing/model-showcase";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { ExplorerPreview } from "@/components/marketing/explorer-preview";
import { ProductPreview } from "@/components/marketing/product-preview";
import { HowCreditsWork } from "@/components/marketing/how-credits-work";
import { ApiMcpTabs } from "@/components/marketing/api-mcp-tabs";
import { FaqSection } from "@/components/marketing/faq-section";
import { CtaSection } from "@/components/marketing/cta-section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Landing page — assembles the marketing sections. The showcase can stream
 * independently so the headline and routing visual do not wait on the catalog.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Suspense fallback={<ModelShowcaseFallback />}>
        <ModelShowcase />
      </Suspense>
      <FeatureGrid />
      <section className="nx-container py-20 md:py-28">
        <SectionHeading
          eyebrow="One workspace"
          title="See the cost before you send"
          description="Keep the conversation, model choice and credit estimate together in one focused workspace."
        />
        <div className="mt-10">
          <ProductPreview />
        </div>
      </section>
      <Suspense fallback={<ExplorerPreviewSkeleton />}>
        <ExplorerPreview />
      </Suspense>
      <HowCreditsWork />
      <ApiMcpTabs />
      <FaqSection />
      <CtaSection />
    </>
  );
}

function ExplorerPreviewSkeleton() {
  return (
    <section className="nx-container py-20 md:py-28" aria-hidden>
      <Skeleton className="h-28 max-w-2xl" />
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-80" />)}
      </div>
    </section>
  );
}
