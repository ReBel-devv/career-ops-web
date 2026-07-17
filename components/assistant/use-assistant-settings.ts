"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_EFFORT, DEFAULT_MODEL, EFFORT_LEVELS } from "@/lib/assistant/config";
import type { AssistantEffort, AssistantMode } from "@/lib/assistant/types";

/** User-tunable assistant preferences (ASSISTANT-PLAN §1: tunable model & effort). */
export interface AssistantSettings {
  /** Model id sent with each turn. */
  model: string;
  /** Reasoning effort sent with each turn. */
  effort: AssistantEffort;
  /** Autonomy mode applied to NEW conversations (each one can still toggle). */
  defaultMode: AssistantMode;
}

export const ASSISTANT_MODELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

const DEFAULTS: AssistantSettings = {
  model: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
  defaultMode: "confirmation",
};

const STORAGE_KEY = "career-ops.assistant.settings";

/**
 * Module-level store shared by every consumer (settings popover, chat hooks in
 * the widget AND the page) — a change in one place propagates everywhere.
 * Hydration-safe: the server snapshot is the defaults; localStorage is read
 * once on the client after mount, then subscribers re-render.
 */
let current: AssistantSettings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): Partial<AssistantSettings> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<AssistantSettings> = {};
  if (typeof r.model === "string" && ASSISTANT_MODELS.some((m) => m.id === r.model)) {
    out.model = r.model;
  }
  if (
    typeof r.effort === "string" &&
    (EFFORT_LEVELS as readonly string[]).includes(r.effort)
  ) {
    out.effort = r.effort as AssistantEffort;
  }
  if (r.defaultMode === "confirmation" || r.defaultMode === "autonomous") {
    out.defaultMode = r.defaultMode;
  }
  return out;
}

function loadOnce(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      current = { ...DEFAULTS, ...sanitize(JSON.parse(raw)) };
      listeners.forEach((l) => l());
    }
  } catch {
    // Corrupt storage — keep defaults.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => current;
const getServerSnapshot = () => DEFAULTS;

/** Update one or more settings; persisted to localStorage and broadcast. */
export function updateAssistantSettings(patch: Partial<AssistantSettings>): void {
  current = { ...current, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable (private mode) — settings stay in-memory.
  }
  listeners.forEach((l) => l());
}

/** Reactive assistant settings, shared across all assistant surfaces. */
export function useAssistantSettings(): AssistantSettings {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(loadOnce, []);
  return settings;
}
