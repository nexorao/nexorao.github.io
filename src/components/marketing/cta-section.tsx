import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/marketing/reveal";

export function CtaSection() {
  return (
    <section className="nx-container pb-24">
      <Reveal>
        <div className="glass glass-edge relative overflow-hidden rounded-xl px-6 py-14 text-center md:px-12">
          <div
            aria-hidden
            className="glow-soft left-1/2 top-0 h-48 w-1/2 -translate-x-1/2"
          />
          <div aria-hidden className="noise absolute inset-0 rounded-xl" />
          <div className="relative">
            <h2 className="mx-auto max-w-xl text-3xl font-semibold text-text-0 md:text-4xl">
              Start with 100 free credits, every day
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-text-1 md:text-base">
              Register, pick a verified model and see exactly what each response
              costs. Upgrade or top up only when the free allowance runs out.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/pricing">
                  View plans
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="glass" asChild>
                <Link href="/models">Explore models</Link>
              </Button>
            </div>
            <p className="mt-5 text-xs text-text-2">
              No payment details needed for the free plan. Paid plans use secure
              Razorpay checkout where payments are enabled.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
