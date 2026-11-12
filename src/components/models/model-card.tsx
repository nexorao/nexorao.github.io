import { AlertTriangle, Brain, CheckCircle2, Eye, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  CATEGORY_LABELS,
  verificationStatus,
  type ModelEntry,
} from "@/data/models";
import { getPlan } from "@/data/plans";
import { creditsPerMTok } from "@/lib/credits";
import { formatCredits, formatDate, formatTokens, formatUsd } from "@/lib/format";
import { ChatButton, CopyIdButton } from "@/components/models/model-actions";
import { ProviderLogo } from "@/components/models/provider-logo";
import { cn } from "@/lib/utils";

interface ModelCardProps {
  model: ModelEntry;
  className?: string;
}

function CapabilityChip({
  icon: Icon,
  label,
}: {
  icon: typeof Eye;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-[var(--glass-bg)] px-2 py-0.5 text-[11px] text-text-1">
      <Icon className="size-3 text-violet" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Presentational model card — safe to render on the server. The two small
 * interactive bits (copy ID, chat CTA) are client components.
 */
export function ModelCard({ model, className }: ModelCardProps) {
  const verified = verificationStatus(model) === "verified";
  const plan = getPlan(model.minPlan);
  const inCredits = creditsPerMTok(model, "input");
  const outCredits = creditsPerMTok(model, "output");

  return (
    <Card
      className={cn(
        "glass-interactive flex h-full flex-col gap-4 p-5 hover:-translate-y-0.5",
        className,
      )}
    >
      {/* Name + provider */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProviderLogo provider={model.provider} modelId={model.id} size="md" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-0">{model.name}</h3>
            <p className="mt-0.5 text-xs text-text-2">
              {model.provider} · {CATEGORY_LABELS[model.category]}
            </p>
          </div>
        </div>
        {model.status !== "available" ? (
          <Badge variant="warn" className="capitalize">
            {model.status}
          </Badge>
        ) : null}
        {model.active === false ? (
          <Badge variant="warn">Unavailable</Badge>
        ) : null}
      </div>

      {/* Model ID */}
      <div className="-mt-2 flex min-w-0 items-center">
        <CopyIdButton id={model.id} />
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1.5">
        {model.capabilities.vision ? <CapabilityChip icon={Eye} label="Vision" /> : null}
        {model.capabilities.tools ? (
          <CapabilityChip icon={Wrench} label="Tools" />
        ) : null}
        {model.capabilities.reasoning ? (
          <CapabilityChip icon={Brain} label="Reasoning" />
        ) : null}
      </div>

      {/* Stats */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-text-2">Context</dt>
          <dd className="mt-0.5 font-medium text-text-0">
            {model.contextWindow === null
              ? "TBD"
              : `${formatTokens(model.contextWindow)} tokens`}
          </dd>
        </div>
        <div>
          <dt className="text-text-2">Max output</dt>
          <dd className="mt-0.5 font-medium text-text-0">
            {model.maxOutput === null
              ? "TBD"
              : `${formatTokens(model.maxOutput)} tokens`}
          </dd>
        </div>
        <div>
          <dt className="text-text-2">Price / 1M in</dt>
          <dd className="mt-0.5 font-medium text-text-0">
            {model.pricing ? (
              <>
                {formatUsd(model.pricing.inputUsdPerMTok)}
                {inCredits !== null ? (
                  <span className="ml-1 text-text-2">
                    ≈ {formatCredits(inCredits)} cr
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-text-2">Host-dependent</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-text-2">Price / 1M out</dt>
          <dd className="mt-0.5 font-medium text-text-0">
            {model.pricing ? (
              <>
                {formatUsd(model.pricing.outputUsdPerMTok)}
                {outCredits !== null ? (
                  <span className="ml-1 text-text-2">
                    ≈ {formatCredits(outCredits)} cr
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-text-2">Host-dependent</span>
            )}
          </dd>
        </div>
      </dl>

      {/* Plan eligibility */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-text-2">Available from</span>
        <Badge variant="accent">{plan ? `${plan.name} plan` : "—"}</Badge>
      </div>

      {/* Notes (e.g. scheduled price changes, verification TODOs) */}
      {model.notes ? (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-text-2">
          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warn" aria-hidden />
          {model.notes}
        </p>
      ) : null}

      {/* Verification */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px]">
        {verified ? (
          <Badge variant="success">
            <CheckCircle2 className="size-3" aria-hidden />
            Verified {formatDate(model.lastVerified!)}
          </Badge>
        ) : (
          <Badge variant="warn">
            <AlertTriangle className="size-3" aria-hidden />
            Unverified — admin to confirm
          </Badge>
        )}
        {model.sourceUrl ? (
          <a
            href={model.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-2 underline-offset-2 outline-none transition-colors hover:text-text-0 hover:underline focus-visible:ring-2 focus-visible:ring-violet/60"
          >
            Provider docs
          </a>
        ) : null}
      </div>

      <ChatButton modelName={model.name} modelId={model.id} />
    </Card>
  );
}
