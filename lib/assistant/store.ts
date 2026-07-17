/**
 * Local, gitignored persistence for assistant conversations (ASSISTANT-PLAN §5).
 *
 * Layout (under the web app root, never committed):
 *   .assistant/index.json                 — [{ id, title, createdAt, updatedAt }]
 *   .assistant/conversations/{id}.json     — the full conversation + messages
 *
 * Single-user / local, so no locking; every write is atomic (temp + rename) like
 * the repo's other writers. Ids are client-generated and validated against a
 * strict charset so they can never escape the conversations directory.
 */
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";

const ROOT = path.join(process.cwd(), ".assistant");
const CONVERSATIONS_DIR = path.join(ROOT, "conversations");
const INDEX_PATH = path.join(ROOT, "index.json");

/** Conversation ids: url-safe, no separators — prevents path traversal. */
export const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const usageLimitSchema = z.object({
  kind: z.enum(["session", "weekly", "other"]),
  resetsAt: z.number().optional(),
});

/** A legacy tool-log entry — kept so pre-blocks conversations still load and
 * can be migrated on the client. */
const storedLogSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.unknown().optional(),
  ok: z.boolean().optional(),
  summary: z.string().optional(),
});

/** An ordered assistant block (text / thinking / tool). */
const storedBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    seq: z.number(),
    text: z.string(),
    done: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("thinking"),
    seq: z.number(),
    text: z.string(),
    done: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("tool"),
    seq: z.number(),
    id: z.string(),
    name: z.string(),
    input: z.unknown().optional(),
    ok: z.boolean().optional(),
    summary: z.string().optional(),
  }),
]);

const storedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().default(""),
  /** Ordered blocks (current format). Absent on pre-blocks conversations. */
  blocks: z.array(storedBlockSchema).default([]),
  /** Legacy flat tool journal — preserved for client-side migration. */
  logs: z.array(storedLogSchema).optional(),
  permissions: z
    .array(
      z.object({
        requestId: z.string(),
        name: z.string(),
        preview: z.unknown(),
        title: z.string().optional(),
        status: z.enum(["pending", "approved", "denied"]),
        scope: z.enum(["once", "conversation"]).optional(),
        seq: z.number().optional(),
      }),
    )
    .default([]),
  error: z
    .object({ message: z.string(), limit: usageLimitSchema.optional() })
    .optional(),
});

export const storedConversationSchema = z.object({
  id: z.string().regex(CONVERSATION_ID_RE),
  title: z.string().min(1).max(300),
  createdAt: z.number(),
  updatedAt: z.number(),
  sdkSessionId: z.string().optional(),
  mode: z.enum(["confirmation", "autonomous"]).default("confirmation"),
  messages: z.array(storedMessageSchema).default([]),
});

export type StoredConversation = z.infer<typeof storedConversationSchema>;

const indexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
const indexSchema = z.array(indexEntrySchema);

export type ConversationIndexEntry = z.infer<typeof indexEntrySchema>;

function ensureDirs(): void {
  mkdirSync(CONVERSATIONS_DIR, { recursive: true });
}

function conversationPath(id: string): string {
  return path.join(CONVERSATIONS_DIR, `${id}.json`);
}

/** Atomic write (temp + rename), matching the repo's other writers. */
function writeFileAtomic(filePath: string, content: string): void {
  ensureDirs();
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, filePath);
  } catch (err) {
    rmSync(tmpPath, { force: true });
    throw err;
  }
}

function readIndex(): ConversationIndexEntry[] {
  if (!existsSync(INDEX_PATH)) return [];
  try {
    return indexSchema.parse(JSON.parse(readFileSync(INDEX_PATH, "utf8")));
  } catch {
    // Corrupt/absent index — treat as empty (a save rebuilds it).
    return [];
  }
}

function writeIndex(entries: ConversationIndexEntry[]): void {
  writeFileAtomic(INDEX_PATH, JSON.stringify(entries, null, 2));
}

function upsertIndexEntry(entry: ConversationIndexEntry): void {
  const entries = readIndex().filter((e) => e.id !== entry.id);
  entries.push(entry);
  writeIndex(entries);
}

/** All conversations, newest activity first (from the index). */
export function listConversations(): ConversationIndexEntry[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Full conversation, or null when absent/invalid/corrupt. */
export function readConversation(id: string): StoredConversation | null {
  if (!CONVERSATION_ID_RE.test(id)) return null;
  const filePath = conversationPath(id);
  if (!existsSync(filePath)) return null;
  try {
    return storedConversationSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

/** Create or overwrite a conversation (and its index entry). Throws on invalid input. */
export function saveConversation(input: unknown): StoredConversation {
  const conv = storedConversationSchema.parse(input);
  writeFileAtomic(conversationPath(conv.id), JSON.stringify(conv, null, 2));
  upsertIndexEntry({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  });
  return conv;
}

/** Rename a conversation; returns the updated index entry (null if unknown). */
export function renameConversation(
  id: string,
  title: string,
): ConversationIndexEntry | null {
  const conv = readConversation(id);
  if (!conv) return null;
  const trimmed = title.trim().slice(0, 300) || conv.title;
  const updatedAt = Date.now();
  saveConversation({ ...conv, title: trimmed, updatedAt });
  return { id, title: trimmed, createdAt: conv.createdAt, updatedAt };
}

/** Delete a conversation + its index entry. Returns whether a file existed. */
export function deleteConversation(id: string): boolean {
  if (!CONVERSATION_ID_RE.test(id)) return false;
  const filePath = conversationPath(id);
  const existed = existsSync(filePath);
  rmSync(filePath, { force: true });
  writeIndex(readIndex().filter((e) => e.id !== id));
  return existed;
}
