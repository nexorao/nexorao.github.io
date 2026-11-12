"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { mainNav } from "@/lib/site";
import { cn } from "@/lib/utils";

const SOON_TOAST: Record<string, string> = {
  API: "Open the developer docs to use the OpenAI-compatible API.",
  MCP: "Open the developer docs to connect an MCP client.",
};

const SOON_TOAST_DEFAULT = "This page is not available yet.";

export function SiteHeader({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <header
      className="sticky top-0 z-40 border-b border-line"
      style={{
        background: "color-mix(in srgb, var(--bg-0) 72%, transparent)",
        WebkitBackdropFilter: "blur(18px) saturate(140%)",
        backdropFilter: "blur(18px) saturate(140%)",
      }}
    >
      <div className="nx-container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {mainNav.map((item) =>
              item.soon ? (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => toast(SOON_TOAST[item.label] ?? SOON_TOAST_DEFAULT)}
                  className="rounded-md px-3 py-2 text-sm text-text-2 transition-colors outline-none hover:text-text-0 focus-visible:ring-2 focus-visible:ring-violet/60"
                >
                  {item.label}
                  <span className="ml-1.5 rounded-sm bg-[var(--glass-bg-hover)] px-1 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide">
                    soon
                  </span>
                </button>
              ) : (
                <Link
                  key={item.label}
                  href={item.href!}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm transition-colors outline-none hover:text-text-0 focus-visible:ring-2 focus-visible:ring-violet/60",
                    pathname === item.href ? "text-text-0" : "text-text-1",
                  )}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAuthenticated ? (
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : <>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/login">Sign in</Link></Button>
            <Button size="sm" asChild className="hidden sm:inline-flex"><Link href="/register">Get started</Link></Button>
          </>}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" />
              </Button>
            </DialogTrigger>
            <DialogContent
              aria-describedby={undefined}
              wrapperClassName="justify-end p-0"
              panelClassName="h-full w-80 max-w-[85vw] rounded-l-xl rounded-r-none p-0"
            >
              <DialogTitle className="sr-only">Navigation menu</DialogTitle>
              <DialogDescription className="sr-only">
                Site navigation links and account actions.
              </DialogDescription>
              <div className="flex h-full flex-col p-5 pt-12">
                <nav aria-label="Mobile" className="flex flex-col gap-1">
                  {mainNav.map((item) =>
                    item.soon ? (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          toast(SOON_TOAST[item.label] ?? SOON_TOAST_DEFAULT);
                        }}
                        className="flex items-center justify-between rounded-md px-3 py-2.5 text-left text-sm text-text-2 transition-colors outline-none hover:bg-[var(--glass-bg-hover)] hover:text-text-0 focus-visible:ring-2 focus-visible:ring-violet/60"
                      >
                        {item.label}
                        <span className="rounded-sm bg-[var(--glass-bg-hover)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                          soon
                        </span>
                      </button>
                    ) : (
                      <DialogClose asChild key={item.label}>
                        <Link
                          href={item.href!}
                          className="rounded-md px-3 py-2.5 text-sm text-text-0 transition-colors outline-none hover:bg-[var(--glass-bg-hover)] focus-visible:ring-2 focus-visible:ring-violet/60"
                        >
                          {item.label}
                        </Link>
                      </DialogClose>
                    ),
                  )}
                </nav>

                <div className="mt-auto flex flex-col gap-2">
                  {isAuthenticated ? <DialogClose asChild><Button asChild><Link href="/dashboard">Dashboard</Link></Button></DialogClose> : <>
                    <DialogClose asChild><Button asChild variant="outline"><Link href="/login">Sign in</Link></Button></DialogClose>
                    <DialogClose asChild><Button asChild><Link href="/register">Get started</Link></Button></DialogClose>
                  </>}
                  <div className="flex items-center justify-between px-1 pt-2 text-xs text-text-2">
                    <span>Theme</span>
                    <ThemeToggle />
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
