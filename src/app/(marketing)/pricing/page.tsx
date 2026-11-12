import type { Metadata } from "next";
import { PricingTable } from "@/components/pricing/pricing-table";
import { TopUpPacks } from "@/components/pricing/topup-packs";
import { PricingCalculator } from "@/components/pricing/pricing-calculator";
import { FaqSection } from "@/components/marketing/faq-section";
import { CtaSection } from "@/components/marketing/cta-section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Credit packs, subscription plans and a transparent cost calculator. 1 credit = ₹0.01 by default, with clear rates and limits.",
};

export default function PricingPage() {
  return (
    <>
      {/* Page hero */}
      <section className="nx-container pb-10 pt-20 text-center md:pt-28">
        <Reveal className="flex flex-col items-center gap-4">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-violet">
            Pricing
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] text-text-0 md:text-5xl">
            Credits, not surprises
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-text-1 md:text-lg">
            One wallet funds every model. Start with daily free credits,
            subscribe for a monthly allowance or top up when you need more —
            and always see the cost of a request before you send it.
          </p>
          <p className="max-w-xl text-xs leading-relaxed text-text-2">
            Default rate: 1 credit = ₹0.01. All amounts, allowances and
            discounts below are proposed launch pricing and may change over time.
          </p>
        </Reveal>
      </section>

      <section className="nx-container pb-4">
        <PricingTable />
      </section>

      <TopUpPacks />

      {/* The calculator card carries the #calculator anchor itself */}
      <section className="nx-container pb-8">
        <SectionHeading
          eyebrow="Calculator"
          title="Know the cost before you send"
          description="Estimates use the same constants as the billing engine. The authoritative charge is always computed server-side on real token usage."
        />
        <Reveal className="mx-auto mt-10 max-w-3xl">
          <PricingCalculator />
        </Reveal>
      </section>

      <FaqSection />
      <CtaSection />
    </>
  );
}
