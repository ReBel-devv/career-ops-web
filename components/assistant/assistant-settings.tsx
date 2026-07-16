"use client";

import { Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClientConfig } from "@/components/providers/app-providers";
import { EFFORT_LEVELS } from "@/lib/assistant/config";
import type { AssistantEffort, AssistantMode } from "@/lib/assistant/types";
import {
  ASSISTANT_MODELS,
  updateAssistantSettings,
  useAssistantSettings,
} from "./use-assistant-settings";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Assistant preferences popover (model, effort, default autonomy for new
 * conversations). Stored locally per browser; applied to the next turn.
 */
export function AssistantSettingsPopover() {
  const settings = useAssistantSettings();
  const { assistantWritable } = useClientConfig();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Assistant settings"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Settings2 className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <p className="text-sm font-medium">Assistant settings</p>

        <Field label="Model">
          <Select
            value={settings.model}
            onValueChange={(model) => updateAssistantSettings({ model })}
          >
            <SelectTrigger size="sm" className="w-36" aria-label="Model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSISTANT_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Effort">
          <Select
            value={settings.effort}
            onValueChange={(effort) =>
              updateAssistantSettings({ effort: effort as AssistantEffort })
            }
          >
            <SelectTrigger size="sm" className="w-36" aria-label="Effort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EFFORT_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {assistantWritable ? (
          <Field label="New chats">
            <Select
              value={settings.defaultMode}
              onValueChange={(defaultMode) =>
                updateAssistantSettings({ defaultMode: defaultMode as AssistantMode })
              }
            >
              <SelectTrigger size="sm" className="w-36" aria-label="Default mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmation">Ask to confirm</SelectItem>
                <SelectItem value="autonomous">Autonomous</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <p className="text-[11px] leading-snug text-muted-foreground">
          Stored in this browser. Model & effort apply to the next message
          {assistantWritable ? "; the default mode applies to new conversations." : "."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
