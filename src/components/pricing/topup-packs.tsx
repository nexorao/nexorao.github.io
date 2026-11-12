import { TopUpButton } from "@/components/pricing/topup-button";
import { SectionHeading } from "@/components/marketing/section-heading";
import { RevealItem, RevealStagger } from "@/components/marketing/reveal";
import { TOP_UP_PACKS } from "@/data/plans";
import { formatCredits } from "@/lib/format";
import { LocalizedPrice } from "@/components/currency/localized-price";

export function TopUpPacks() {
  return (
    <section className="nx-container py-16">
      <SectionHeading
        eyebrow="Top-ups"
        title="Prefer pay-as-you-go?"
        description="Top up without a subscription. Purchased credits sit in their own wallet bucket with the longest validity."
      />
      <RevealStagger className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TOP_UP_PACKS.map((pack) => (
          <RevealItem key={pack.id}>
            <article className="glass glass-interactive flex h-full flex-col items-center gap-1 rounded-xl p-5 text-center hover:-translate-y-0.5">
              <p className="text-sm font-semibold text-text-0">{pack.name}</p>
              <p className="text-xl font-semibold text-text-0">
                <LocalizedPrice inrAmount={pack.priceInr} />
              </p>
              <p className="text-xs text-text-1">
                {formatCredits(pack.credits)} credits
              </p>
              <p className="mb-3 text-[10px] text-text-2">
                one-time · bonus credits configurable
              </p>
              <TopUpButton packName={pack.name} packId={pack.id} />
            </article>
          </RevealItem>
        ))}
      </RevealStagger>
      <p className="mt-6 text-center text-xs text-text-2">
        Credit amounts follow the default 1 credit = ₹0.01 rate and may change
        as provider costs evolve.
      </p>
    </section>
  );
}
