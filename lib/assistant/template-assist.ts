import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_MODEL } from "./config";
import {
  templateAssistResultSchema,
  type ProfileData,
  type TemplateAssistResult,
} from "@/lib/domain";

/**
 * Single-shot template generation/revision — proposes text, NEVER writes.
 * The proposal goes back to the client as a diff the user must approve; the
 * approved save then flows through the normal PATCH/POST write path. Runs the
 * same Claude Agent SDK the assistant uses (same auth), but with no tools at
 * all: the profile context is embedded in the prompt instead.
 */

export class TemplateAssistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateAssistError";
  }
}

/** Compact, prompt-embeddable profile summary (identity + voice cues). */
export function profileContext(data: ProfileData): string {
  const p = data.profile;
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value && value.trim().length > 0) lines.push(`${label}: ${value.trim()}`);
  };
  push("Name", p.candidate.fullName);
  push("Headline", p.narrative.headline);
  push("Location", [p.location.city, p.location.country].filter(Boolean).join(", "));
  push("LinkedIn", p.candidate.linkedin);
  push("Portfolio", p.candidate.portfolioUrl);
  if (p.targetRoles.primary.length > 0) {
    push("Target roles", p.targetRoles.primary.join(" · "));
  }
  if (p.narrative.superpowers.length > 0) {
    push("Strengths", p.narrative.superpowers.join(" · "));
  }
  push("Story", p.narrative.exitStory);
  for (const proof of p.narrative.proofPoints.slice(0, 3)) {
    push(`Proof — ${proof.name}`, proof.heroMetric ?? proof.url);
  }
  const voice = data.texts.voiceDna;
  if (voice && voice.trim().length > 0) {
    lines.push("", "Writing voice notes (voice-dna.md, excerpt):", voice.trim().slice(0, 1_500));
  }
  return lines.join("\n");
}

const SYSTEM = `You write reusable outreach message templates for a software engineer's job search (emails, LinkedIn messages, follow-ups…).

Rules:
- Write in the language the user's request implies (French request → French template).
- The template must be immediately copy-pasteable: plain text, no markdown decoration, no meta commentary.
- Where a detail depends on the specific recipient/company, keep it generic or use an obvious inline hint the user will replace by hand (e.g. "[entreprise]"). Use them sparingly.
- Ground the content in the candidate profile provided — never invent facts about them.
- Stay concise: recruiters skim.

Respond with ONLY a JSON object, no code fence:
{"title": "short template name", "type": "email" | "linkedin" | "message" | "other", "body": "the template text"}`;

export interface TemplateAssistArgs {
  prompt: string;
  current?: { title: string; type?: string | null; body: string };
  profile: ProfileData;
  /** CAREER_OPS_PATH — the SDK's cwd (no tools are exposed; identity only). */
  cwd: string;
  abortController: AbortController;
}

/** Extract the JSON object from a model reply (tolerates fences/preambles). */
export function parseAssistReply(text: string): TemplateAssistResult | null {
  const candidates = [text.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) candidates.unshift(fenced[1].trim());
  const braced = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (braced.length > 1) candidates.push(braced);

  for (const candidate of candidates) {
    try {
      const parsed = templateAssistResultSchema.safeParse(JSON.parse(candidate));
      if (parsed.success && parsed.data.body.trim().length > 0) {
        return {
          title: parsed.data.title.trim(),
          type: parsed.data.type?.trim().toLowerCase() || null,
          body: parsed.data.body.trim(),
        };
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Run the proposal turn. Throws `TemplateAssistError` on failure. */
export async function runTemplateAssist(
  args: TemplateAssistArgs,
): Promise<TemplateAssistResult> {
  const sections = [
    `# Candidate profile\n${profileContext(args.profile)}`,
    ...(args.current
      ? [
          `# Current template — "${args.current.title}"${
            args.current.type ? ` (type: ${args.current.type})` : ""
          }\n${args.current.body}`,
          `# Revision request\n${args.prompt}`,
        ]
      : [`# New template request\n${args.prompt}`]),
  ];

  let finalText = "";
  const stream = query({
    prompt: sections.join("\n\n"),
    options: {
      cwd: args.cwd,
      model: DEFAULT_MODEL,
      effort: "medium",
      abortController: args.abortController,
      // No tools: the context is fully embedded; one model turn.
      allowedTools: [],
      disallowedTools: ["*"],
      permissionMode: "dontAsk",
      maxTurns: 1,
      settingSources: [],
      systemPrompt: SYSTEM,
    },
  });

  for await (const msg of stream) {
    if (msg.type === "assistant" && msg.error) {
      throw new TemplateAssistError(`Assistant error: ${msg.error}`);
    }
    if (msg.type === "result") {
      if (msg.subtype === "success" && typeof msg.result === "string") {
        finalText = msg.result;
      } else if (msg.subtype !== "success") {
        throw new TemplateAssistError(`The model turn failed (${msg.subtype}).`);
      }
    }
  }

  const parsed = parseAssistReply(finalText);
  if (!parsed) {
    throw new TemplateAssistError(
      "The model reply could not be parsed as a template proposal.",
    );
  }
  return parsed;
}
