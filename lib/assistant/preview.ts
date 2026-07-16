/**
 * Build a `PermissionPreview` from a tool call's input, so the confirmation card
 * can show a diff (Write/Edit) or the exact command (Bash) before the user
 * approves it.
 */
import type { PermissionPreview } from "./types";

/** Coerce an unknown tool-input field to a string (empty when absent). */
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Map a supported tool + input to the preview rendered in the permission card. */
export function buildPreview(
  toolName: string,
  input: Record<string, unknown>,
): PermissionPreview {
  switch (toolName) {
    case "Write":
      return {
        kind: "write",
        path: str(input.file_path),
        content: str(input.content),
      };
    case "Edit":
      return {
        kind: "edit",
        path: str(input.file_path),
        oldString: str(input.old_string),
        newString: str(input.new_string),
      };
    case "Bash":
      return {
        kind: "command",
        command: str(input.command),
        description: typeof input.description === "string" ? input.description : undefined,
      };
    default:
      return { kind: "generic", text: JSON.stringify(input, null, 2) };
  }
}
