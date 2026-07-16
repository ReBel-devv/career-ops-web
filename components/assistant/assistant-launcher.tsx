"use client";

import { motion } from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";

const FILL_DURATION = 0.5;
const FILL_EASE = [0.16, 1, 0.3, 1] as const;

/** Diameter of the circle that fully covers the button from origin (x, y). */
function coverDiameter(
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  return Math.ceil(
    2 *
      Math.max(
        Math.hypot(x, y),
        Math.hypot(width - x, y),
        Math.hypot(x, height - y),
        Math.hypot(width - x, height - y),
      ),
  );
}

/**
 * Circular chat launcher (FAB) — a monochrome adaptation of the OriginButton
 * fill effect: a `foreground`-colored disc grows from the pointer origin on
 * hover, inverting the icon. In the dark default theme that reads as a black
 * button with a white hover fill; it inverts cleanly in light mode.
 */
export function AssistantLauncher({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState(0);
  const showFill = hovered || pressed;

  const setOriginAt = useCallback((x: number, y: number) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setOrigin({ x, y });
    setSize(coverDiameter(rect.width, rect.height, x, y));
  }, []);

  const setOriginFromCenter = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setOriginAt(rect.width / 2, rect.height / 2);
  }, [setOriginAt]);

  // Keep the cover sized correctly if the button resizes while filled.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !showFill) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize(coverDiameter(rect.width, rect.height, origin.x, origin.y));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [showFill, origin.x, origin.y]);

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={open ? "Close assistant" : "Open assistant"}
      aria-expanded={open}
      whileTap={{ scale: 0.97 }}
      onPointerEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setOriginAt(e.clientX - rect.left, e.clientY - rect.top);
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setOriginAt(e.clientX - rect.left, e.clientY - rect.top);
        setPressed(true);
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) {
          setOriginFromCenter();
          setHovered(true);
        }
      }}
      onBlur={() => {
        setHovered(false);
        setPressed(false);
      }}
      className={cn(
        // pointer-events-auto: the widget wrapper is pointer-events-none (its
        // box covers page content), so the button re-enables events itself.
        "pointer-events-auto relative flex size-11 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-border bg-background shadow-lg md:size-13",
        "transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        showFill ? "text-background" : "text-foreground",
      )}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
        initial={false}
        animate={{ scale: showFill && size > 0 ? 1 : 0 }}
        transition={{ duration: FILL_DURATION, ease: FILL_EASE }}
        style={{ width: size, height: size, left: origin.x, top: origin.y }}
      />
      <MessageSquare
        className={cn(
          "absolute size-5 transition-all duration-200 md:size-5.5",
          open ? "scale-0 opacity-0" : "scale-100 opacity-100",
        )}
        aria-hidden
      />
      <X
        className={cn(
          "absolute size-5 transition-all duration-200 md:size-5.5",
          open ? "scale-100 opacity-100" : "scale-0 opacity-0",
        )}
        aria-hidden
      />
    </motion.button>
  );
}
