import { MODELS, type ModelEntry } from "@/data/models";
import { listModelCatalog } from "@/lib/models/registry";
import { LiveModelNetwork, type RoutingModel } from "@/components/marketing/live-model-network";
import { ProviderStrip } from "@/components/marketing/provider-strip";

/** Landing-page catalog slice with the fields the routing visual displays. */
function toTickerModel(model: ModelEntry): RoutingModel {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    price: model.pricing ? model.pricing.inputUsdPerMTok : null,
    isNew: model.status === "preview",
  };
}

function staticModels(): RoutingModel[] {
  return MODELS.filter((model) => model.status !== "deprecated").map(toTickerModel);
}

export async function ModelShowcase() {
  let models = staticModels();
  try {
    const catalog = await listModelCatalog();
    const active = catalog.filter((model) => model.active && model.status !== "deprecated");
    if (active.length > 0) {
      models = active.map(toTickerModel);
    }
  } catch {
    // Keep the landing page usable with its bundled catalog if the database is unavailable.
  }

  return (
    <>
      <LiveModelNetwork models={models} />
      <ProviderStrip models={models} />
    </>
  );
}

export function ModelShowcaseFallback() {
  const models = staticModels();
  return (
    <>
      <LiveModelNetwork models={models} />
      <ProviderStrip models={models} />
    </>
  );
}
