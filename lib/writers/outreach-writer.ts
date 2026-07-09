import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import {
  OUTREACH_SCHEMA_VERSION,
  OUTREACH_STAGES,
  outreachDocSchema,
  type AddOutreachContactInput,
  type DeleteOutreachContactInput,
  type OutreachContact,
  type OutreachDoc,
  type OutreachMutationResult,
  type OutreachStage,
  type OutreachStageDates,
  type UpdateOutreachContactInput,
} from "@/lib/domain";
import { sanitizeNotes } from "@/lib/notes";
import {
  acquireOutreachLock,
  OutreachLockTimeoutError,
  outreachPathFor,
  type OutreachLockOptions,
} from "./outreach-lock";

/**
 * Atomic read-modify-write for `data/outreach.yml` — the ONLY mutation this
 * milestone (M6) is allowed in the data repo (plan §4.6/§4.7, Decision 2).
 *
 * Every write: acquire the outreach lock → read+parse (or start empty) → apply
 * a pure mutator → zod-validate the WHOLE document → serialize with the schema
 * comment header → backup + atomic temp-rename → re-parse gate (restore backup
 * if the file no longer parses or the change isn't present). The file is created
 * with the header + empty structure when absent.
 *
 * Stage machine: moves are unrestricted (Decision 5 spirit). Setting a stage
 * records its date in `stageDates` and makes it current; it never deletes dates
 * for other stages, so regressing/skipping is non-destructive and reversible.
 */

/** Human/CLI-facing schema doc written at the top of every outreach.yml. */
const OUTREACH_HEADER = `# career-ops — LinkedIn / recruiter outreach tracker
#
# User-layer file (survives \`update-system.mjs\`). Written by the web dashboard's
# outreach panel; the future target for \`contacto\` mode.
#
# Schema:
#   version: 1
#   applications:
#     "<tracker app #>":            # string key = the tracker row number
#       - id: <stable id>           # addresses the contact for edit/delete
#         kind: recruiter | hiring-manager | peer | founder
#         name: <full name>
#         linkedin: <profile url>   # optional
#         company_role: <their role at the company>   # optional
#         stage: identified | requested | accepted | messaged | replied
#         stage_dates:              # YYYY-MM-DD per stage actually reached
#           identified: 2026-07-01
#           requested: 2026-07-03
#         notes: <free text>        # optional
#
# Stage machine is linear (identified → requested → accepted → messaged →
# replied) but not enforced: stages may be set in any order (skips and
# regressions allowed); only stages you reach get a date.
`;

export type OutreachWriteErrorCode =
  | "INVALID_INPUT"
  | "READ_ONLY"
  | "NOT_FOUND"
  | "LOCK_TIMEOUT"
  | "PARSE_FAILED";

export class OutreachWriteError extends Error {
  constructor(
    readonly code: OutreachWriteErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "OutreachWriteError";
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidCalendarDate(str: string): boolean {
  if (!DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

/* -------------------------------------------------------- parse / serialize */

const EMPTY_DOC: OutreachDoc = {
  version: OUTREACH_SCHEMA_VERSION,
  applications: {},
};

interface RawContact {
  id?: unknown;
  kind?: unknown;
  name?: unknown;
  linkedin?: unknown;
  company_role?: unknown;
  stage?: unknown;
  stage_dates?: unknown;
  notes?: unknown;
}

/** Map a snake_case YAML contact into the camelCase in-memory shape (pre-zod). */
function fromRawContact(raw: RawContact): Record<string, unknown> {
  const stageDates: Record<string, unknown> = {};
  if (raw.stage_dates && typeof raw.stage_dates === "object") {
    for (const [k, v] of Object.entries(raw.stage_dates as object)) {
      stageDates[k] = v;
    }
  }
  const out: Record<string, unknown> = {
    id: raw.id,
    kind: raw.kind,
    name: raw.name,
    stage: raw.stage,
    stageDates,
  };
  if (raw.linkedin != null) out.linkedin = raw.linkedin;
  if (raw.company_role != null) out.companyRole = raw.company_role;
  if (raw.notes != null) out.notes = raw.notes;
  return out;
}

/**
 * Parse `data/outreach.yml` content into a validated `OutreachDoc`.
 * An empty/whitespace file yields the empty document. Throws on malformed YAML
 * or a document that fails the zod schema.
 */
export function parseOutreachDoc(content: string): OutreachDoc {
  if (content.trim() === "") return { ...EMPTY_DOC };
  let loaded: unknown;
  try {
    loaded = loadYaml(content);
  } catch (err: unknown) {
    // js-yaml v5 throws on comment-only input ("expected a document, but the
    // input is empty") — a header-only outreach.yml IS the empty document.
    if (err instanceof Error && /input is empty/i.test(err.message)) {
      return { ...EMPTY_DOC };
    }
    throw err;
  }
  if (loaded == null) return { ...EMPTY_DOC };
  if (typeof loaded !== "object") {
    throw new Error("outreach.yml root is not a mapping");
  }
  const doc = loaded as { version?: unknown; applications?: unknown };
  const applications: Record<string, unknown[]> = {};
  const rawApps =
    doc.applications && typeof doc.applications === "object"
      ? (doc.applications as Record<string, unknown>)
      : {};
  for (const [num, list] of Object.entries(rawApps)) {
    if (!Array.isArray(list)) continue;
    applications[num] = list.map((c) => fromRawContact((c ?? {}) as RawContact));
  }
  return outreachDocSchema.parse({
    version: typeof doc.version === "number" ? doc.version : OUTREACH_SCHEMA_VERSION,
    applications,
  });
}

/** Serialize a contact into an ordered snake_case plain object for YAML dump. */
function toRawContact(c: OutreachContact): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    id: c.id,
    kind: c.kind,
    name: c.name,
  };
  if (c.linkedin) raw.linkedin = c.linkedin;
  if (c.companyRole) raw.company_role = c.companyRole;
  raw.stage = c.stage;
  // Emit stage dates in the canonical stage order for a stable, readable file.
  const stageDates: Record<string, string> = {};
  for (const stage of OUTREACH_STAGES) {
    const d = c.stageDates[stage];
    if (d) stageDates[stage] = d;
  }
  raw.stage_dates = stageDates;
  if (c.notes) raw.notes = c.notes;
  return raw;
}

/** Serialize the whole document to YAML text with the schema comment header. */
export function serializeOutreachDoc(doc: OutreachDoc): string {
  // Sort app keys numerically for a deterministic, diff-friendly file.
  const appNums = Object.keys(doc.applications).sort(
    (a, b) => Number(a) - Number(b),
  );
  const applications: Record<string, unknown[]> = {};
  for (const num of appNums) {
    const contacts = doc.applications[num];
    if (!contacts || contacts.length === 0) continue; // never persist empty lists
    applications[num] = contacts.map(toRawContact);
  }
  const body = dumpYaml(
    { version: doc.version, applications },
    { lineWidth: -1, noRefs: true, sortKeys: false },
  );
  return `${OUTREACH_HEADER}\n${body}`;
}

/* ----------------------------------------------------------- pure mutators */

function newContactId(): string {
  return `c_${randomUUID().slice(0, 8)}`;
}

/** Clean a single-line text field (pipes/newlines collapsed); undefined → drop. */
function cleanField(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const clean = sanitizeNotes(value);
  return clean === "" ? undefined : clean;
}

function contactsFor(doc: OutreachDoc, appNum: number): OutreachContact[] {
  return doc.applications[String(appNum)] ?? [];
}

/** Apply an add. Returns the new doc and the created contact. */
export function applyAddContact(
  doc: OutreachDoc,
  input: AddOutreachContactInput,
): { doc: OutreachDoc; contact: OutreachContact } {
  const name = sanitizeNotes(input.name);
  if (name === "") {
    throw new OutreachWriteError("INVALID_INPUT", "Contact name is required.");
  }
  const stage: OutreachStage = input.stage ?? "identified";
  const date = input.date ?? todayStr();
  const stageDates: OutreachStageDates = { [stage]: date };
  const contact: OutreachContact = {
    id: newContactId(),
    kind: input.kind,
    name,
    linkedin: cleanField(input.linkedin),
    companyRole: cleanField(input.companyRole),
    stage,
    stageDates,
    notes: cleanField(input.notes),
  };
  const key = String(input.appNum);
  const next: OutreachDoc = {
    version: doc.version,
    applications: {
      ...doc.applications,
      [key]: [...contactsFor(doc, input.appNum), contact],
    },
  };
  return { doc: next, contact };
}

/** Apply an edit / stage-set. Throws NOT_FOUND when the contact is absent. */
export function applyUpdateContact(
  doc: OutreachDoc,
  input: UpdateOutreachContactInput,
): { doc: OutreachDoc; contact: OutreachContact } {
  const key = String(input.appNum);
  const list = contactsFor(doc, input.appNum);
  const idx = list.findIndex((c) => c.id === input.contactId);
  if (idx === -1) {
    throw new OutreachWriteError(
      "NOT_FOUND",
      `Contact ${input.contactId} not found for application #${input.appNum}.`,
    );
  }
  const current = list[idx];
  const updated: OutreachContact = { ...current, stageDates: { ...current.stageDates } };

  if (input.kind !== undefined) updated.kind = input.kind;
  if (input.name !== undefined) {
    const name = sanitizeNotes(input.name);
    if (name === "") {
      throw new OutreachWriteError("INVALID_INPUT", "Contact name is required.");
    }
    updated.name = name;
  }
  if (input.linkedin !== undefined) updated.linkedin = cleanField(input.linkedin);
  if (input.companyRole !== undefined) {
    updated.companyRole = cleanField(input.companyRole);
  }
  if (input.notes !== undefined) updated.notes = cleanField(input.notes);
  if (input.stage !== undefined) {
    // Unrestricted move: set current stage + stamp its date (non-destructive).
    updated.stage = input.stage;
    updated.stageDates[input.stage] = input.date ?? todayStr();
  }

  const nextList = [...list];
  nextList[idx] = updated;
  const next: OutreachDoc = {
    version: doc.version,
    applications: { ...doc.applications, [key]: nextList },
  };
  return { doc: next, contact: updated };
}

/** Apply a delete. Throws NOT_FOUND when the contact is absent. */
export function applyDeleteContact(
  doc: OutreachDoc,
  input: DeleteOutreachContactInput,
): { doc: OutreachDoc } {
  const key = String(input.appNum);
  const list = contactsFor(doc, input.appNum);
  const idx = list.findIndex((c) => c.id === input.contactId);
  if (idx === -1) {
    throw new OutreachWriteError(
      "NOT_FOUND",
      `Contact ${input.contactId} not found for application #${input.appNum}.`,
    );
  }
  const nextList = list.filter((c) => c.id !== input.contactId);
  const applications = { ...doc.applications };
  if (nextList.length === 0) delete applications[key];
  else applications[key] = nextList;
  return { doc: { version: doc.version, applications } };
}

/* --------------------------------------------------------------- fs write */

/** Same-directory temp file + rename — mirrors the other writers. */
function writeFileAtomic(filePath: string, content: string): void {
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

function assertValidAppNum(appNum: number): void {
  if (!Number.isInteger(appNum) || appNum <= 0) {
    throw new OutreachWriteError(
      "INVALID_INPUT",
      `Invalid application num: ${appNum}`,
    );
  }
}

/**
 * The locked read-modify-write core. `mutate` receives the parsed document and
 * returns the next document plus the mutation result to hand back. Everything
 * else (lock, validate, serialize, backup, atomic write, re-parse gate) is here.
 */
async function withOutreachWrite(
  repoPath: string,
  mutate: (doc: OutreachDoc) => {
    doc: OutreachDoc;
    result: OutreachMutationResult;
  },
  lockOptions?: OutreachLockOptions,
): Promise<OutreachMutationResult> {
  const outreachPath = outreachPathFor(repoPath);

  let lock;
  try {
    lock = await acquireOutreachLock(outreachPath, lockOptions);
  } catch (err: unknown) {
    if (err instanceof OutreachLockTimeoutError) {
      throw new OutreachWriteError("LOCK_TIMEOUT", err.message);
    }
    throw err;
  }

  try {
    let original: string | null;
    try {
      original = await fs.readFile(outreachPath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") original = null;
      else throw err;
    }

    let doc: OutreachDoc;
    try {
      doc = original == null ? { ...EMPTY_DOC } : parseOutreachDoc(original);
    } catch (err: unknown) {
      throw new OutreachWriteError(
        "PARSE_FAILED",
        "Existing outreach.yml is malformed — refusing to overwrite it.",
        err instanceof Error ? err.message : String(err),
      );
    }

    const { doc: nextDoc, result } = mutate(doc);
    // Validate the WHOLE document before persisting (belt-and-suspenders on top
    // of the per-mutation construction).
    const validated = outreachDocSchema.parse(nextDoc);
    const serialized = serializeOutreachDoc(validated);

    await fs.mkdir(path.dirname(outreachPath), { recursive: true });
    writeFileAtomic(outreachPath, serialized);

    // Re-parse gate: the file must still parse into an equivalent document.
    let parsedOk = false;
    try {
      parseOutreachDoc(serialized);
      parsedOk = true;
    } catch {
      parsedOk = false;
    }
    if (!parsedOk) {
      if (original == null) await fs.rm(outreachPath, { force: true });
      else writeFileAtomic(outreachPath, original);
      throw new OutreachWriteError(
        "PARSE_FAILED",
        "outreach.yml no longer parses after the write — the file was restored.",
      );
    }

    return result;
  } finally {
    lock.release();
  }
}

export async function addOutreachContact(
  repoPath: string,
  input: AddOutreachContactInput,
  lockOptions?: OutreachLockOptions,
): Promise<OutreachMutationResult> {
  assertValidAppNum(input.appNum);
  if (input.date !== undefined && !isValidCalendarDate(input.date)) {
    throw new OutreachWriteError(
      "INVALID_INPUT",
      `Date must be a real calendar date (YYYY-MM-DD): ${input.date}`,
    );
  }
  return withOutreachWrite(
    repoPath,
    (doc) => {
      const { doc: next, contact } = applyAddContact(doc, input);
      return {
        doc: next,
        result: {
          appNum: input.appNum,
          contacts: next.applications[String(input.appNum)] ?? [],
          contact,
        },
      };
    },
    lockOptions,
  );
}

export async function updateOutreachContact(
  repoPath: string,
  input: UpdateOutreachContactInput,
  lockOptions?: OutreachLockOptions,
): Promise<OutreachMutationResult> {
  assertValidAppNum(input.appNum);
  if (input.date !== undefined && !isValidCalendarDate(input.date)) {
    throw new OutreachWriteError(
      "INVALID_INPUT",
      `Date must be a real calendar date (YYYY-MM-DD): ${input.date}`,
    );
  }
  return withOutreachWrite(
    repoPath,
    (doc) => {
      const { doc: next, contact } = applyUpdateContact(doc, input);
      return {
        doc: next,
        result: {
          appNum: input.appNum,
          contacts: next.applications[String(input.appNum)] ?? [],
          contact,
        },
      };
    },
    lockOptions,
  );
}

export async function deleteOutreachContact(
  repoPath: string,
  input: DeleteOutreachContactInput,
  lockOptions?: OutreachLockOptions,
): Promise<OutreachMutationResult> {
  assertValidAppNum(input.appNum);
  return withOutreachWrite(
    repoPath,
    (doc) => {
      const { doc: next } = applyDeleteContact(doc, input);
      return {
        doc: next,
        result: {
          appNum: input.appNum,
          contacts: next.applications[String(input.appNum)] ?? [],
        },
      };
    },
    lockOptions,
  );
}
