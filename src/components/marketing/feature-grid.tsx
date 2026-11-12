import {
  Coins,
  Compass,
  Columns2,
  Cable,
  ShieldCheck,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { SectionHeading } from "@/components/marketing/section-heading";
import { RevealItem, RevealStagger } from "@/components/marketing/reveal";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Coins,
    title: "One credit wallet",
    description:
      "Spend credits across Claude, GPT, Gemini and open-source models. Buckets, expiry and rollover are enforced atomically on the server.",
  },
  {
    icon: Compass,
    title: "Live model registry",
    description:
      "Capabilities, context windows, per-model pricing and a last-verified date for every entry — maintained against provider documentation, not hardcoded.",
  },
  {
    icon: Columns2,
    title: "Comparison workspace",
    description:
      "Run one prompt across 2–4 models in parallel and see latency, output and credit cost side by side before you commit.",
  },
  {
    icon: Terminal,
    title: "OpenAI-compatible API",
    description:
      "Point your existing OpenAI SDK at NEXORAO. One hashed, scoped key reaches every provider, with honest per-model parameter support.",
  },
  {
    icon: Cable,
    title: "MCP server",
    description:
      "Connect MCP clients and agents with Nexora-issued credentials, per-tool permissions and the same wallet enforcement as the API.",
  },
  {
    icon: ShieldCheck,
    title: "Server-side cost control",
    description:
      "Credits are reserved, committed and refunded inside database transactions. Browser-computed costs are never trusted.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="nx-container py-20 md:py-28">
      <SectionHeading
        eyebrow="Platform"
        title="Everything a multi-model workflow needs"
        description="Built for developers, creators, students and teams — one account instead of one subscription per provider."
      />
      <RevealStagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <RevealItem key={feature.title}>
            <article className="glass glass-interactive h-full rounded-xl p-5 hover:-translate-y-0.5">
              <div className="flex size-10 items-center justify-center rounded-md bg-violet/10 text-violet">
                <feature.icon className="size-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-text-0">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-1">
                {feature.description}
              </p>
            </article>
          </RevealItem>
        ))}
      </RevealStagger>
    </section>
  );
}
