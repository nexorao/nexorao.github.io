import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-md border border-line bg-[var(--glass-bg)] px-3 py-2 text-sm text-text-0 transition-colors outline-none",
        "placeholder:text-text-2",
        "hover:border-line-strong",
        "focus-visible:border-violet/50 focus-visible:ring-2 focus-visible:ring-violet/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
