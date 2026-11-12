"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds to wait before this element animates (for manual staggering). */
  delay?: number;
  /** Travel distance in px. */
  y?: number;
}

/** Fade-up on scroll reveal, staggered by `delay`, disabled for reduced motion. */
export function Reveal({ children, className, delay = 0, y = 14 }: RevealProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduceMotion ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px 0px" }}
      transition={{ duration: 0.55, delay: reduceMotion ? 0 : delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

export function RevealStagger({
  children,
  className,
  stagger = 0.08,
}: RevealProps & { stagger?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, y = 14 }: RevealProps) {
  const reduceMotion = useReducedMotion();
  const yValue = reduceMotion ? 0 : y;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: yValue },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: EASE_OUT_EXPO },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
