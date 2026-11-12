"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Blocks,
  Braces,
  Boxes,
  Code2,
  MessageSquare,
  MousePointer2,
  Terminal,
} from "lucide-react";
import { ProviderLogo } from "@/components/models/provider-logo";

export type RoutingModel = {
  id: string;
  name: string;
  provider: string;
  /** Provider list input price, USD per 1M tokens. null = unverified. */
  price: number | null;
  isNew: boolean;
};

type FeaturedModel = RoutingModel & { providerLabel: string };

/** Dev tools that reach NEXORAO through an OpenAI-compatible endpoint. */
const SOURCES = [
  { label: "Cursor", detail: "AI code editor", Icon: MousePointer2 },
  { label: "Claude Code", detail: "Terminal agent", Icon: Terminal },
  { label: "Cline", detail: "VS Code agent", Icon: Code2 },
  { label: "Kilo Code", detail: "VS Code agent", Icon: Boxes },
  { label: "OpenCode", detail: "Open source CLI", Icon: Braces },
  { label: "OpenAI SDK", detail: "Official SDK", Icon: Blocks },
] as const;

/** Vertical slot of each chip on the routing canvas (%). */
const SOURCE_TOPS = [12, 27, 42, 57, 72, 87];
const MODEL_TOPS = [15, 30, 45, 60, 75, 90];

const FEATURED_PROVIDERS = [
  { label: "Anthropic · Claude", match: /anthropic|claude/i },
  { label: "OpenAI · GPT", match: /openai|gpt/i },
  { label: "Google · Gemini", match: /google|gemini/i },
  { label: "DeepSeek", match: /deepseek/i },
  { label: "Moonshot · Kimi", match: /moonshot|kimi/i },
  { label: "Zhipu · GLM", match: /zhipu|glm/i },
];

function selectFeaturedModels(models: RoutingModel[]): FeaturedModel[] {
  const picked = FEATURED_PROVIDERS.flatMap((featured) => {
    const model = models.find((candidate) =>
      featured.match.test(`${candidate.provider} ${candidate.id} ${candidate.name}`),
    );
    return model ? [{ ...model, providerLabel: featured.label }] : [];
  });
  if (picked.length >= 4) {
    return picked.slice(0, MODEL_TOPS.length);
  }
  // Keep the visual full if the live catalog only covers a few providers.
  const seen = new Set(picked.map((model) => model.id));
  const fill = models
    .filter((model) => !seen.has(model.id))
    .map((model) => ({ ...model, providerLabel: model.provider }));
  return [...picked, ...fill].slice(0, MODEL_TOPS.length);
}

function formatPrice(price: number) {
  return `$${price.toFixed(Number.isInteger(price) ? 0 : 2)}`;
}

const CYCLE = {
  /** Pause before each model starts typing (ms). */
  lead: 700,
  /** Typing jitter per character (ms). */
  typeMin: 42,
  typeJitter: 50,
  /** How long the lit wire + selected chip stay before the next model (ms). */
  hold: 2600,
};

/**
 * Types one model after another into the gateway. While a model is still
 * typing every wire stays calm; the moment the name is complete that model's
 * wire lights up, its chip is marked selected and a status line reports the
 * request — then the next model takes over.
 */
function useGatewayCycle(featured: FeaturedModel[]) {
  const [typed, setTyped] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stats, setStats] = useState<{ latency: number; rate: number } | null>(null);

  useEffect(() => {
    if (featured.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let index = 0;

    const runCycle = () => {
      if (cancelled) return;
      const model = featured[index % featured.length];

      // Calm phase: no selection, no status, wires rest while typing starts.
      setActiveId(null);
      setStats(null);
      setTyped("");

      let chars = 0;
      const typeStep = () => {
        if (cancelled) return;
        chars += 1;
        setTyped(model.id.slice(0, chars));
        if (chars < model.id.length) {
          timer = setTimeout(typeStep, CYCLE.typeMin + Math.random() * CYCLE.typeJitter);
          return;
        }
        // Typing complete: light this model's wire and report the request.
        setActiveId(model.id);
        setStats({
          latency: 128 + Math.floor(Math.random() * 240),
          rate: 42 + Math.floor(Math.random() * 86),
        });
        timer = setTimeout(() => {
          index += 1;
          runCycle();
        }, CYCLE.hold);
      };

      timer = setTimeout(typeStep, CYCLE.lead);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No animation: park on the first model with a settled status line.
      timer = setTimeout(() => {
        if (cancelled) return;
        setTyped(featured[0].id);
        setActiveId(featured[0].id);
        setStats({ latency: 214, rate: 68 });
      }, 0);
    } else {
      runCycle();
    }

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [featured]);

  return { typed, activeId, stats };
}

export function LiveModelNetwork({ models }: { models: RoutingModel[] }) {
  const featured = useMemo(() => selectFeaturedModels(models), [models]);
  const { typed, activeId, stats } = useGatewayCycle(featured);
  const routedModel = activeId ? featured.find((model) => model.id === activeId) ?? null : null;

  return (
    <section id="model-routing" className="nx-container nx-live-section">
      <div className="nx-live-heading">
        <p>One endpoint. Leading AI.</p>
        <span>Claude, GPT and Gemini route through one NEXORAO workspace.</span>
      </div>

      <div className="nx-live-routing" aria-label="NEXORAO connects leading AI models to the tools you build with">
        <div aria-hidden className="nx-live-grid" />
        <div className="nx-live-canvas">
          <svg aria-hidden className="nx-live-wires" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="nx-live-gradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#8eb4ff" stopOpacity="0.4" />
                <stop offset="45%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="62%" stopColor="#f7fbff" stopOpacity="1" />
                <stop offset="100%" stopColor="#76c7ff" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            {SOURCES.map((source, index) => {
              const y = SOURCE_TOPS[index];
              return (
                <path
                  key={source.label}
                  className="nx-live-wire"
                  d={`M 19 ${y} C 23 ${y}, 23 50, 26 50`}
                />
              );
            })}
            {featured.map((model, index) => {
              const y = MODEL_TOPS[index];
              const selected = model.id === activeId;
              const d = `M 64 50 C 68 50, 68 ${y}, 71 ${y}`;
              return (
                <Fragment key={model.id}>
                  <path className={selected ? "nx-live-wire is-selected" : "nx-live-wire"} d={d} />
                  {selected && <path className="nx-live-wire-comet" d={d} />}
                </Fragment>
              );
            })}
          </svg>

          <div className="nx-live-gateway">
            <div className="nx-live-gateway-header">
              <span className="nx-live-brand-mark">
                <Image src="/brand/nexora-mark.webp" alt="" aria-hidden width={128} height={128} />
              </span>
              <span className="nx-live-brand-copy">
                <strong>NEXORAO</strong>
                <small>One unified AI endpoint</small>
              </span>
              <span className="nx-live-preview-badge"><span /> Connected</span>
            </div>

            <div className="nx-live-code-block">
              <span className="nx-live-method">POST</span>
              <span>/v1/chat/completions</span>
              <span className="nx-live-code-muted">provider</span>
              <strong>Claude · GPT · Gemini</strong>
              <span className="nx-live-code-muted">model</span>
              <strong className="nx-live-model-line">
                {typed}
                {routedModel?.isNew && <span className="nx-live-typed-tag">NEW</span>}
                <span className="nx-live-caret" aria-hidden />
              </strong>
              <span className="nx-live-code-muted">access</span>
              <strong>One API key</strong>
              <span className="nx-live-code-muted">status</span>
              <strong className={routedModel ? "nx-live-status is-ok" : "nx-live-status"}>
                {stats ? (
                  <>
                    <span className="nx-live-status-ok">200 OK</span>
                    {` · ${stats.latency} ms · ${stats.rate} tok/s`}
                  </>
                ) : (
                  "routing…"
                )}
              </strong>
            </div>

            <div className="nx-live-gateway-footer">
              <span>One workspace</span>
              <span>Official provider APIs</span>
            </div>
          </div>

          {SOURCES.map((source, index) => {
            const model = featured[index];
            return (
              <Fragment key={source.label}>
                <div
                  className="nx-live-source"
                  style={{ top: `${SOURCE_TOPS[index]}%`, animationDelay: `${-index * 1.05}s` }}
                >
                  <span className="nx-live-tool-mark" aria-hidden>
                    <source.Icon />
                  </span>
                  <span className="nx-live-node-copy">
                    <span className="nx-live-node-title">{source.label}</span>
                    <span className="nx-live-node-detail">{source.detail}</span>
                  </span>
                </div>
                {model ? (
                  <Link
                    href={`/models#${model.id}`}
                    className={model.id === activeId ? "nx-live-model is-selected" : "nx-live-model"}
                    style={{ top: `${MODEL_TOPS[index]}%`, animationDelay: `${-0.5 - index * 1.05}s` }}
                    aria-label={`Explore ${model.name} from ${model.provider}`}
                  >
                    <ProviderLogo provider={model.provider} modelId={model.id} size="sm" className="nx-live-model-logo" />
                    <span className="nx-live-node-copy">
                      <span className="nx-live-node-title">{model.name}</span>
                      <span className="nx-live-node-detail">{model.providerLabel}</span>
                    </span>
                    {model.price !== null && (
                      <span className="nx-live-price" title="Input price per 1M tokens">
                        {formatPrice(model.price)}
                      </span>
                    )}
                    {model.isNew && <span className="nx-live-selected-tag">New</span>}
                    <ArrowUpRight aria-hidden className="nx-live-model-arrow" />
                  </Link>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>

      <p className="nx-live-caption">
        <MessageSquare aria-hidden />
        One API route connects your apps to the AI models you choose.
      </p>
    </section>
  );
}
