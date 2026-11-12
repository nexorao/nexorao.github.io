"use client";

import * as React from "react";
import { ArrowDownUp, Brain, Eye, Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ModelCard } from "@/components/models/model-card";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type ModelEntry,
  type ProviderCategory,
} from "@/data/models";
import { cn } from "@/lib/utils";

type CategoryFilter = ProviderCategory | "all";
type SortKey = "price-low" | "price-high" | "context" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  "price-low": "Price: low → high",
  "price-high": "Price: high → low",
  context: "Largest context",
  name: "Name (A → Z)",
};

function sortModels(models: ModelEntry[], key: SortKey): ModelEntry[] {
  const sorted = [...models];
  switch (key) {
    case "price-low":
      sorted.sort(
        (a, b) =>
          (a.pricing?.inputUsdPerMTok ?? Number.POSITIVE_INFINITY) -
          (b.pricing?.inputUsdPerMTok ?? Number.POSITIVE_INFINITY),
      );
      break;
    case "price-high":
      sorted.sort(
        (a, b) =>
          (b.pricing?.inputUsdPerMTok ?? Number.NEGATIVE_INFINITY) -
          (a.pricing?.inputUsdPerMTok ?? Number.NEGATIVE_INFINITY),
      );
      break;
    case "context":
      sorted.sort((a, b) => (b.contextWindow ?? -1) - (a.contextWindow ?? -1));
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return sorted;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-violet/60",
        active
          ? "border-violet/50 bg-violet/10 text-violet"
          : "border-line text-text-2 hover:border-line-strong hover:text-text-0",
      )}
    >
      {children}
    </button>
  );
}

export function ModelExplorer({ models }: { models: ModelEntry[] }) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<CategoryFilter>("all");
  const [visionOnly, setVisionOnly] = React.useState(false);
  const [reasoningOnly, setReasoningOnly] = React.useState(false);
  const [sort, setSort] = React.useState<SortKey>("price-low");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = models.filter((model) => {
      if (category !== "all" && model.category !== category) return false;
      if (visionOnly && !model.capabilities.vision) return false;
      if (reasoningOnly && !model.capabilities.reasoning) return false;
      if (!q) return true;
      return (
        model.name.toLowerCase().includes(q) ||
        model.id.toLowerCase().includes(q) ||
        model.provider.toLowerCase().includes(q)
      );
    });
    return sortModels(result, sort);
  }, [models, query, category, visionOnly, reasoningOnly, sort]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models, providers or IDs…"
              aria-label="Search models"
              className="pl-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between sm:w-52"
                aria-label={`Sort models — current: ${SORT_LABELS[sort]}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ArrowDownUp className="size-4 shrink-0 text-text-2" aria-hidden />
                  <span className="truncate text-sm">{SORT_LABELS[sort]}</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <DropdownMenuItem key={key} onSelect={() => setSort(key)}>
                  {SORT_LABELS[key]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All providers
          </Chip>
          {CATEGORY_ORDER.map((c) => (
            <Chip
              key={c}
              active={category === c}
              onClick={() => setCategory(c)}
            >
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
          <span aria-hidden className="mx-1 hidden h-4 w-px bg-line sm:block" />
          <Chip active={visionOnly} onClick={() => setVisionOnly((v) => !v)}>
            <span className="flex items-center gap-1.5">
              <Eye className="size-3" aria-hidden />
              Vision
            </span>
          </Chip>
          <Chip
            active={reasoningOnly}
            onClick={() => setReasoningOnly((v) => !v)}
          >
            <span className="flex items-center gap-1.5">
              <Brain className="size-3" aria-hidden />
              Reasoning
            </span>
          </Chip>
        </div>
      </div>

      <p className="mt-4 text-xs text-text-2" role="status">
        {filtered.length} of {models.length} models
      </p>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((model) => (
            <ModelCard key={model.id} model={model} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={SearchX}
          title="No models match those filters"
          description="Try a different search term, clear the category filter, or widen the capability filters."
          className="mt-4"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setCategory("all");
                setVisionOnly(false);
                setReasoningOnly(false);
              }}
            >
              Clear all filters
            </Button>
          }
        />
      )}
    </div>
  );
}
