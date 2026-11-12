import type { RoutingModel } from "@/components/marketing/live-model-network";
import { ProviderLogo } from "@/components/models/provider-logo";

/** Chips per loop group — wide enough to cover any screen edge to edge. */
const SLOTS = 14;

/**
 * Spread models across providers (one chip per provider in turn) so the loop
 * reads varied, then repeat the catalog when it runs out.
 */
function buildMarqueeModels(models: RoutingModel[]): RoutingModel[] {
  const pools: RoutingModel[][] = [];
  const byProvider = new Map<string, RoutingModel[]>();
  for (const model of models) {
    const pool = byProvider.get(model.provider);
    if (pool) pool.push(model);
    else {
      const created = [model];
      byProvider.set(model.provider, created);
      pools.push(created);
    }
  }

  const spread: RoutingModel[] = [];
  let cursor = 0;
  while (spread.length < SLOTS) {
    const active = pools.filter((pool) => pool.length > 0);
    if (active.length === 0) break;
    const model = active[cursor % active.length].shift();
    if (model) spread.push(model);
    cursor += 1;
  }

  return spread.flatMap((model) => Array.from({ length: Math.ceil(SLOTS / spread.length) }, () => model)).slice(0, SLOTS);
}

/**
 * Full-width model marquee. The track holds two identical groups and the
 * animation shifts exactly one group width per loop, so the row runs edge to
 * edge forever without ever stopping halfway.
 */
export function ProviderStrip({ models }: { models: RoutingModel[] }) {
  const marqueeModels = buildMarqueeModels(models);
  if (marqueeModels.length === 0) return null;

  return (
    <section
      className="border-y border-line py-6 sm:py-8"
      style={{ background: "color-mix(in srgb, var(--bg-1) 55%, transparent)" }}
      aria-label="AI models available on NEXORAO"
    >
      <p className="mb-5 text-center text-xs text-text-2">
        One workspace · Every frontier model · One credit wallet
      </p>
      <div className="nx-model-marquee">
        <div className="nx-model-marquee-track">
          {[0, 1].map((copy) => (
            <ul key={copy} className="nx-model-marquee-group" aria-hidden={copy === 1 || undefined}>
              {marqueeModels.map((model, index) => (
                <li key={`${model.id}-${index}`} className="nx-tool-chip">
                  <ProviderLogo provider={model.provider} modelId={model.id} size="sm" />
                  <span>{model.name}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-5 max-w-3xl text-center text-[10px] leading-relaxed text-text-2">
        Provider names and marks belong to their respective owners. NEXORAO connects through authorized provider APIs.
      </p>
    </section>
  );
}
