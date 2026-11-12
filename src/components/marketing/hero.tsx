"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EASE_OUT_EXPO } from "@/components/marketing/reveal";

const fadeUp = (delay: number, reduce: boolean | null) => ({
  initial: { opacity: 0, y: reduce ? 0 : 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease: EASE_OUT_EXPO },
});

export function Hero() {
  const reduceMotion = useReducedMotion();

  function followButtonPointer(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--nx-button-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--nx-button-y", `${event.clientY - bounds.top}px`);
  }

  return (
    <section className="relative overflow-hidden pb-5 pt-20 md:pt-28">
      <div className="nx-container flex flex-col items-center text-center">
        <motion.div {...fadeUp(0, reduceMotion)}>
          <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-text-1">
            <Sparkles className="size-3.5 text-violet" aria-hidden />
            One wallet · Official APIs · Credits, not surprises
          </span>
        </motion.div>

        <motion.h1
          {...fadeUp(0.06, reduceMotion)}
          className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.08] text-text-0 sm:text-5xl md:text-[3.5rem]"
        >
          Every frontier model.{" "}
          <span className="bg-grad-accent bg-clip-text text-transparent">
            One credit wallet.
          </span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.12, reduceMotion)}
          className="mt-5 max-w-xl text-base leading-relaxed text-text-1 md:text-lg"
        >
          NEXORAO brings Claude, GPT, Gemini and open-source models into one
          workspace. Chat, compare and build on official APIs — billed
          transparently in credits, with the cost of every response shown up
          front.
        </motion.p>

        <motion.div
          {...fadeUp(0.18, reduceMotion)}
          className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button
            size="lg"
            className="nx-button-shine"
            onPointerMove={followButtonPointer}
            asChild
          >
            <Link href="/register">
              Start free
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button size="lg" variant="glass" asChild>
            <Link href="/models">Explore models</Link>
          </Button>
        </motion.div>

        <motion.p
          {...fadeUp(0.24, reduceMotion)}
          className="mt-6 text-xs text-text-2"
        >
          Anthropic Claude · OpenAI GPT · Google Gemini · open-source models —
          via official APIs only
        </motion.p>
      </div>
    </section>
  );
}
