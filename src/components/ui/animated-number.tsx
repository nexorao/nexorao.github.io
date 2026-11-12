"use client";

import * as React from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps extends React.ComponentProps<"span"> {
  value: number;
  format?: (value: number) => string;
}

/**
 * Counts up when scrolled into view, then tweens smoothly whenever `value`
 * changes. Jumps instantly when the user prefers reduced motion.
 */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString("en-IN"),
  className,
  ...props
}: AnimatedNumberProps) {
  const [display, setDisplay] = React.useState(value);
  const latest = React.useRef(value);
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (!inView || reduceMotion) {
      // Keep the tween origin current so a later animation starts from
      // the right place. No state updates here — the render below shows
      // the real value directly for reduced motion.
      latest.current = value;
      return;
    }
    const controls = animate(latest.current, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        latest.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [value, inView, reduceMotion]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)} {...props}>
      {format(reduceMotion ? value : display)}
    </span>
  );
}
