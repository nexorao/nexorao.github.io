import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Not found",
  description: "The page you requested does not exist on NEXORAO.",
};

export default function NotFound() {
  return (
    <section className="nx-container flex flex-col items-center py-28 text-center md:py-36">
      <div className="glass glass-edge relative overflow-hidden rounded-xl px-6 py-16 md:px-16">
        <div aria-hidden className="noise absolute inset-0 rounded-xl" />
        <div className="relative flex flex-col items-center gap-5">
          <span className="glass flex size-12 items-center justify-center rounded-full">
            <Compass className="size-5 text-violet" aria-hidden />
          </span>
          <p className="font-mono text-sm text-text-2">404</p>
          <h1 className="max-w-md text-3xl font-semibold text-text-0 md:text-4xl">
            This page drifted out of orbit
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-text-1 md:text-base">
            The address does not match anything in the workspace. The models and
            pricing pages are a good place to land instead.
          </p>
          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            <Button variant="glass" asChild>
              <Link href="/models">Explore models</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
