"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps extends React.ComponentProps<"figure"> {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({
  code,
  language = "text",
  title,
  className,
  ...props
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions); silently ignore.
    }
  }

  return (
    <figure
      className={cn("overflow-hidden rounded-lg border border-line bg-bg-1", className)}
      {...props}
    >
      <figcaption className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-xs text-text-2">
          <span aria-hidden className="size-2 rounded-full bg-grad-accent" />
          {title ?? language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs transition-colors outline-none",
            "text-text-2 hover:bg-[var(--glass-bg-hover)] hover:text-text-0",
            "focus-visible:ring-2 focus-visible:ring-violet/60",
          )}
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-text-1">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
