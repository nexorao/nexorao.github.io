"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast(`Model ID copied: ${id}`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not access the clipboard in this browser.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy model ID ${id}`}
      title="Copy model ID"
      className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 font-mono text-[11px] text-text-2 transition-colors outline-none hover:bg-[var(--glass-bg-hover)] hover:text-text-0 focus-visible:ring-2 focus-visible:ring-violet/60"
    >
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {id}
    </button>
  );
}

export function ChatButton({ modelName, modelId }: { modelName: string; modelId: string }) {
  return (
    <Button variant="glass" size="sm" className="w-full" asChild>
      <Link href={"/chat/start?model=" + encodeURIComponent(modelId)}>
        <MessagesSquare className="size-4" aria-hidden />
        Chat with {modelName}
      </Link>
    </Button>
  );
}
