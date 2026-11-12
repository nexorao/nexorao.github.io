import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.ComponentProps<"div"> {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center",
        className,
      )}
      {...props}
    >
      <div className="grid size-10 place-items-center rounded-md bg-[var(--glass-bg)] text-text-2">
        <Icon className="size-5" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium text-text-0">{title}</p>
        {description ? (
          <p className="mt-1 max-w-sm text-sm text-text-2">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
