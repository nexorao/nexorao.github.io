"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-overlay-in",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Content renders inside a full-viewport flex wrapper so the inner glass
 * panel can animate independently of centering transforms.
 * `panelClassName` styles the glass panel; `wrapperClassName` overrides the
 * positioning wrapper (e.g. for side drawers).
 */
export function DialogContent({
  className,
  wrapperClassName,
  panelClassName,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  wrapperClassName?: string;
  panelClassName?: string;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "group fixed inset-0 z-50 flex items-end justify-center p-4 focus:outline-none sm:items-center",
          wrapperClassName,
        )}
        {...props}
      >
        <div
          className={cn(
            "glass-strong group-data-[state=open]:animate-content-in relative w-full max-w-lg rounded-xl p-6",
            className,
            panelClassName,
          )}
        >
          {children}
          <DialogPrimitive.Close
            className={cn(
              "absolute right-4 top-4 rounded-sm p-1 text-text-2 transition-colors outline-none",
              "hover:text-text-0 focus-visible:ring-2 focus-visible:ring-violet/60",
            )}
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold text-text-0", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-text-1", className)}
      {...props}
    />
  );
}
