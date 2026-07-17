"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";

/**
 * Reveal `target` progressively, like live typing.
 *
 * The agent streams text in bursts (a few words ~twice a second); applied
 * verbatim that reads as jumpy blocks. This decouples the *received* text
 * (`target`, which grows as deltas arrive) from the *shown* text: on every
 * animation frame the shown substring advances toward the target at an adaptive
 * rate — faster when it has fallen behind, so it never lags for long, but still
 * paced enough to read as typing. When `animate` goes false (the block finished,
 * or the turn was aborted) the full text is shown at once. Honors
 * prefers-reduced-motion.
 */
export function useTypewriter(target: string, animate: boolean): string {
  const reduce = usePrefersReducedMotion();
  const enabled = animate && !reduce;
  const [shownLen, setShownLen] = useState(enabled ? 0 : target.length);
  const targetRef = useRef(target);

  // Track the latest target without writing a ref during render.
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      setShownLen((cur) => {
        const total = targetRef.current.length;
        if (cur >= total) return cur;
        const backlog = total - cur;
        // Reveal ~a quarter of the backlog per frame (min 1 char): a burst
        // drains smoothly instead of snapping in, and a slow trickle still
        // advances one character at a time.
        const step = Math.max(1, Math.ceil(backlog / 4));
        return Math.min(total, cur + step);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  // Not animating (reduced motion, or the block is done/aborted) → full text.
  if (!enabled) return target;
  return target.slice(0, shownLen);
}
