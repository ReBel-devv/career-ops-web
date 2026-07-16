"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import createGlobe, { type Marker } from "cobe";
import { usePrefersReducedMotion } from "@/lib/client/use-reduced-motion";
import type { GlobeCity } from "@/lib/geo";

/**
 * Offer globe (desktop gimmick, /analytics) — one cobe marker per resolved
 * city, every dot the same neon red (purely decorative: the data lives in the
 * hover label — city, offer count, best score). Hovering a marker reveals its
 * CSS-anchor-positioned label (cobe v2 exposes `--cobe-{id}` anchors +
 * `--cobe-visible-{id}` when front-facing); a blurred halo anchored on each
 * front-facing marker provides the glow. Dragging anywhere on the card
 * rotates the globe (pointer capture on the container, so no child element
 * can steal the gesture).
 *
 * Honesty note: only offers whose free-text location resolves to a gazetteer
 * city are plotted — the Locations bar chart stays the complete view.
 */

const AUTO_SPEED = 0.0025;

/** Neon red — decorative (identical in both themes), so it deliberately
 * bypasses the state tokens. GL floats for cobe, CSS string for the halos. */
const NEON_RED_GL: [number, number, number] = [1, 0.23, 0.19]; // ≈ #ff3b30
const NEON_RED_CSS = "rgb(255 59 48)";

/** Marker id namespace — cobe writes `--cobe-visible-{id}` on :root. */
function slug(name: string): string {
  return `offer-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** More offers → slightly bigger dot (sub-linear so Paris doesn't swallow EU). */
function citySize(count: number): number {
  return Math.min(0.075, 0.028 + 0.014 * Math.sqrt(count - 1));
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeDark(callback: () => void): () => void {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/** `prefers-color-scheme: dark` as state (the site's dark: variant follows
 * it) — same useSyncExternalStore idiom as usePrefersReducedMotion. */
function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribeDark,
    () => window.matchMedia(DARK_QUERY).matches,
    () => true, // dark is the site default
  );
}

const noopSubscribe = (): (() => void) => () => {};

/** CSS Anchor Positioning support (Chromium 125+ / Safari 26) — labels are a
 * progressive enhancement; the marker dots render everywhere regardless. */
function useAnchorSupport(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof CSS !== "undefined" && CSS.supports("position-anchor", "--a"),
    () => false, // SSR: assume unsupported until the client says otherwise
  );
}

export function OfferGlobe({ cities }: { cities: GlobeCity[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerStart = useRef<{ x: number; phi: number } | null>(null);
  const phiOffsetRef = useRef(0);
  const pausedRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  const prefersDark = usePrefersDark();
  const anchorsSupported = useAnchorSupport();
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverRaf = useRef(0);
  /** Latest cursor position — the rAF hit-test reads this so fast pointermove
   * bursts are coalesced (never dropped). */
  const lastPointer = useRef({ x: 0, y: 0 });

  /**
   * Nearest front-facing marker to the cursor, or null. Reuses cobe's own
   * anchor divs (1px, `anchor-name: --cobe-{id}`, repositioned every frame
   * inside its canvas wrapper) — no reimplementation of the projection, so
   * hit-testing can never drift from the rendering.
   */
  const markerAt = useCallback((clientX: number, clientY: number): string | null => {
    const wrapper = canvasRef.current?.parentElement;
    if (!wrapper) return null;
    const rootStyle = getComputedStyle(document.documentElement);
    let best: string | null = null;
    let bestDist = 24; // px hit radius
    for (const el of wrapper.children) {
      if (!(el instanceof HTMLDivElement)) continue;
      const name = el.style.getPropertyValue("anchor-name");
      if (!name.startsWith("--cobe-offer-")) continue;
      const id = name.slice("--cobe-".length);
      // cobe deletes the visibility var when the marker faces away.
      if (!rootStyle.getPropertyValue(`--cobe-visible-${id}`)) continue;
      const rect = el.getBoundingClientRect();
      const dist = Math.hypot(rect.left - clientX, rect.top - clientY);
      if (dist < bestDist) {
        bestDist = dist;
        best = id;
      }
    }
    return best;
  }, []);

  /**
   * All interaction lives on the CONTAINER with pointer capture: the drag
   * works no matter which child (canvas, cobe's wrapper, a label) is under
   * the cursor, and keeps tracking outside the card once started.
   */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); // no text-selection / native drag from the globe
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStart.current = { x: e.clientX, phi: phiOffsetRef.current };
    pausedRef.current = true;
    setHovered(null);
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointerStart.current !== null) {
        phiOffsetRef.current =
          pointerStart.current.phi + (e.clientX - pointerStart.current.x) / 200;
        return;
      }
      if (!anchorsSupported) return;
      // Hover hit-test at most once per frame, on the LATEST position.
      lastPointer.current = { x: e.clientX, y: e.clientY };
      if (hoverRaf.current) return;
      hoverRaf.current = requestAnimationFrame(() => {
        hoverRaf.current = 0;
        setHovered(markerAt(lastPointer.current.x, lastPointer.current.y));
      });
    },
    [anchorsSupported, markerAt],
  );

  const handlePointerEnd = useCallback((e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    pointerStart.current = null;
    pausedRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (pointerStart.current === null) setHovered(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let globe: ReturnType<typeof createGlobe> | null = null;
    let raf = 0;
    let phi = 0;

    function init() {
      if (!canvas || globe) return;
      const width = canvas.offsetWidth;
      if (width === 0) return;

      const markers: Marker[] = cities.map((city) => ({
        id: slug(city.name),
        location: city.location,
        size: citySize(city.count),
      }));

      globe = createGlobe(canvas, {
        // cobe multiplies width/height by devicePixelRatio itself.
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width,
        height: width,
        phi: 0,
        // Tilt toward the EU/US latitude band where the offers live.
        theta: 0.32,
        dark: prefersDark ? 1 : 0,
        diffuse: prefersDark ? 1.2 : 1.5,
        mapSamples: 16000,
        mapBrightness: prefersDark ? 7 : 9,
        baseColor: prefersDark ? [0.32, 0.32, 0.34] : [0.93, 0.93, 0.93],
        markerColor: NEON_RED_GL,
        glowColor: prefersDark ? [0.09, 0.09, 0.1] : [0.9, 0.9, 0.9],
        markerElevation: 0.012,
        opacity: prefersDark ? 0.85 : 0.7,
        markers,
      });

      const frame = () => {
        if (!pausedRef.current && !reducedMotion) phi += AUTO_SPEED;
        globe?.update({ phi: phi + phiOffsetRef.current });
        raf = requestAnimationFrame(frame);
      };
      frame();
      setTimeout(() => {
        canvas.style.opacity = "1";
      });
    }

    if (canvas.offsetWidth > 0) {
      init();
    } else {
      // The card can mount display:hidden (below lg) — init on first layout.
      const ro = new ResizeObserver((entries) => {
        if ((entries[0]?.contentRect.width ?? 0) > 0) {
          ro.disconnect();
          init();
        }
      });
      ro.observe(canvas);
      return () => {
        ro.disconnect();
        if (raf) cancelAnimationFrame(raf);
        globe?.destroy();
      };
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      globe?.destroy();
    };
  }, [cities, prefersDark, reducedMotion]);

  // Hover-only labels: every city has one, only the hovered marker's shows
  // (and even then only while it faces the camera — the visibility var).
  const labeled = anchorsSupported ? cities : [];

  return (
    <div
      className="relative aspect-square w-full touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerLeave}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 1s ease",
          touchAction: "none",
        }}
      />
      {/* Neon halos — a blurred red disc rides every front-facing marker
          (cobe draws the sharp dot; the halo provides the glow). */}
      {labeled.map((city) => {
        const id = slug(city.name);
        const halo = 6 + 3 * Math.sqrt(city.count);
        return (
          <span
            key={`halo-${id}`}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              positionAnchor: `--cobe-${id}`,
              top: "anchor(center)",
              left: "anchor(center)",
              translate: "-50% -50%",
              width: halo,
              height: halo,
              // Alpha baked into the color: the visibility var only gates
              // 0 ↔ visible, so the glow stays subtle.
              background: "rgb(255 59 48 / 0.5)",
              boxShadow: `0 0 ${halo}px 1px rgb(255 59 48 / 0.35)`,
              filter: "blur(3px)",
              opacity: `var(--cobe-visible-${id}, 0)`,
              transition: "opacity 0.3s",
            }}
          />
        );
      })}
      {labeled.map((city) => {
        const id = slug(city.name);
        return (
          <div
            key={`label-${id}`}
            className="pointer-events-none absolute flex items-center gap-1.5 rounded-md border bg-popover px-2 py-1 text-[11px] leading-none text-popover-foreground shadow-sm"
            style={{
              positionAnchor: `--cobe-${id}`,
              bottom: "anchor(top)",
              left: "anchor(center)",
              translate: "-50% 0",
              marginBottom: 6,
              whiteSpace: "nowrap",
              opacity:
                hovered === id ? `var(--cobe-visible-${id}, 0)` : 0,
              transition: "opacity 0.2s",
            }}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: NEON_RED_CSS }}
            />
            {city.name}
            <span className="font-mono font-semibold tabular-nums">
              {city.count}
            </span>
            {city.bestScore !== null ? (
              <span className="font-mono tabular-nums text-muted-foreground">
                ≤{city.bestScore.toFixed(1)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact top-cities list under the globe — fills the card's leftover height
 * with the same data the hover labels carry, and doubles as the text
 * alternative to the canvas (labels are hover-only and anchor-gated).
 */
export function OfferGlobeCityList({
  cities,
  max = 5,
}: {
  cities: GlobeCity[];
  max?: number;
}) {
  const top = cities.slice(0, max);
  if (top.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y text-xs">
      {top.map((city) => (
        <li key={city.name} className="flex items-center gap-2 py-1.5">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: NEON_RED_CSS }}
          />
          <span className="min-w-0 flex-1 truncate">{city.name}</span>
          <span className="font-mono font-semibold tabular-nums">
            {city.count}
          </span>
          <span className="w-10 text-right font-mono tabular-nums text-muted-foreground">
            {city.bestScore !== null ? `≤${city.bestScore.toFixed(1)}` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
