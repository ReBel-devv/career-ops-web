"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import {
  applicationSchema,
  documentSchema,
  followUpCadenceSchema,
  followUpDataSchema,
  reportFacetSchema,
  reportSchema,
  type Application,
  type CanonicalState,
  type Document,
  type FollowUpCadence,
  type FollowUpData,
  type Report,
  type ReportFacet,
} from "@/lib/domain";

/**
 * Client-side server-state layer (TanStack Query). The Board, the Applications
 * table, and the stats header all read from these two shared queries, and every
 * write goes through `useApplicationActions` — one optimistic mutation with an
 * undo toast and 409 rollback, PATCHing the M1 endpoint (never the writer
 * directly).
 */

export const applicationsKey = ["applications"] as const;
export const statesKey = ["states"] as const;

const applicationsResponse = z.object({ applications: z.array(applicationSchema) });

// The serialized CanonicalState carries the transformed keys (dashboardGroup),
// not the raw states.yml keys — so it needs its own client schema.
const clientStateSchema = z.object({
  id: z.string(),
  label: z.string(),
  aliases: z.array(z.string()),
  description: z.string(),
  dashboardGroup: z.string(),
});
const statesResponse = z.object({ states: z.array(clientStateSchema) });

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function useApplications() {
  return useQuery({
    queryKey: applicationsKey,
    queryFn: async (): Promise<Application[]> => {
      const json = await fetchJson("/api/applications");
      return applicationsResponse.parse(json).applications;
    },
  });
}

export function useStates() {
  return useQuery({
    queryKey: statesKey,
    // states.yml changes almost never within a session.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CanonicalState[]> => {
      const json = await fetchJson("/api/states");
      return statesResponse.parse(json).states;
    },
  });
}

const reportResponse = z.object({ report: reportSchema });
const documentsResponse = z.object({ documents: z.array(documentSchema) });
const followUpsResponse = z.object({ data: followUpDataSchema });
const reportFacetsResponse = z.object({ facets: z.array(reportFacetSchema) });

/** Parsed report for one application (null when the endpoint 404s). */
export function useReport(num: number) {
  return useQuery({
    queryKey: ["report", num] as const,
    queryFn: async (): Promise<Report | null> => {
      const res = await fetch(`/api/applications/${num}/report`, {
        headers: { accept: "application/json" },
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      return reportResponse.parse(await res.json()).report;
    },
  });
}

/** CV + cover-letter documents for one application. */
export function useDocuments(num: number) {
  return useQuery({
    queryKey: ["documents", num] as const,
    queryFn: async (): Promise<Document[]> => {
      const json = await fetchJson(`/api/applications/${num}/documents`);
      return documentsResponse.parse(json).documents;
    },
  });
}

/** Logged follow-ups + pins (whole file; consumers slice per app). */
export function useFollowUps() {
  return useQuery({
    queryKey: followUpsKey,
    queryFn: async (): Promise<FollowUpData> => {
      const json = await fetchJson("/api/follow-ups");
      return followUpsResponse.parse(json).data;
    },
  });
}

const followUpCadenceResponse = z.object({ cadence: followUpCadenceSchema });

export const followUpCadenceKey = ["follow-ups-cadence"] as const;
export const followUpsKey = ["follow-ups"] as const;

/** Follow-up cadence from followup-cadence.mjs (never recomputed client-side). */
export function useFollowUpCadence() {
  return useQuery({
    queryKey: followUpCadenceKey,
    queryFn: async (): Promise<FollowUpCadence> => {
      const json = await fetchJson("/api/follow-ups/cadence");
      return followUpCadenceResponse.parse(json).cadence;
    },
  });
}

/** Per-report facets (archetype / vendor / location) powering the filters. */
export function useReportFacets() {
  return useQuery({
    queryKey: ["report-facets"] as const,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReportFacet[]> => {
      const json = await fetchJson("/api/report-facets");
      return reportFacetsResponse.parse(json).facets;
    },
  });
}

/** Shape of the PATCH response we care about client-side (server owns the full one). */
const patchResponseSchema = z.object({
  application: applicationSchema,
  notesSanitized: z.boolean().optional(),
  followupSeed: z
    .object({
      error: z.string().optional(),
      result: z.object({ seeded: z.boolean(), nextDate: z.string().optional() }).optional(),
    })
    .partial()
    .optional(),
});

class PatchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PatchError";
  }
}

interface PatchBody {
  status?: string;
  notes?: string;
  expected: { company: string; role: string };
}

async function patchApplication(num: number, body: PatchBody) {
  const res = await fetch(`/api/applications/${num}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    throw new PatchError(json.error ?? `Update failed (${res.status})`, res.status, json.code);
  }
  return patchResponseSchema.parse(json);
}

/** Optimistically patch one row in the applications cache. */
function patchCacheRow(
  qc: QueryClient,
  num: number,
  patch: Partial<Application>,
): Application[] | undefined {
  const previous = qc.getQueryData<Application[]>(applicationsKey);
  if (previous) {
    qc.setQueryData<Application[]>(
      applicationsKey,
      previous.map((a) => (a.num === num ? { ...a, ...patch } : a)),
    );
  }
  return previous;
}

type MoveVars = {
  kind: "status";
  app: Application;
  targetStatusId: string;
  isUndo: boolean;
};
type NotesVars = { kind: "notes"; app: Application; notes: string };
type Vars = MoveVars | NotesVars;
type Ctx = { previous: Application[] | undefined };

/**
 * Optimistic write actions shared by the board (drag + move menu), the mobile
 * action sheet, and the inline status/notes editors.
 */
export function useApplicationActions() {
  const qc = useQueryClient();

  const mutation = useMutation<
    z.infer<typeof patchResponseSchema>,
    unknown,
    Vars,
    Ctx
  >({
    mutationFn: async (vars) => {
      const expected = { company: vars.app.company, role: vars.app.role };
      if (vars.kind === "status") {
        const states = qc.getQueryData<CanonicalState[]>(statesKey);
        const target = states?.find((s) => s.id === vars.targetStatusId);
        // Writer accepts a canonical label OR id; prefer the label when known.
        return patchApplication(vars.app.num, {
          status: target?.label ?? vars.targetStatusId,
          expected,
        });
      }
      return patchApplication(vars.app.num, { notes: vars.notes, expected });
    },

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: applicationsKey });
      if (vars.kind === "status") {
        const states = qc.getQueryData<CanonicalState[]>(statesKey);
        const target = states?.find((s) => s.id === vars.targetStatusId) ?? null;
        const previous = patchCacheRow(qc, vars.app.num, {
          statusId: target?.id ?? vars.targetStatusId,
          statusLabel: target?.label ?? null,
          statusRaw: target?.label ?? vars.targetStatusId,
          dashboardGroup: target?.dashboardGroup ?? null,
        });
        return { previous };
      }
      return { previous: patchCacheRow(qc, vars.app.num, { notes: vars.notes }) };
    },

    onError: (error, vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(applicationsKey, ctx.previous);
      const status = error instanceof PatchError ? error.status : undefined;
      const message = error instanceof Error ? error.message : String(error);
      if (status === 409) {
        toast.error(`#${vars.app.num} changed on disk`, {
          description: "The row was edited by another writer. Reloading the latest.",
        });
        void qc.invalidateQueries({ queryKey: applicationsKey });
      } else {
        toast.error(`Couldn't update #${vars.app.num}`, { description: message });
      }
    },

    onSuccess: (data, vars) => {
      // Authoritative server row wins over the optimistic guess.
      qc.setQueryData<Application[]>(applicationsKey, (prev) =>
        prev?.map((a) => (a.num === data.application.num ? data.application : a)),
      );

      if (vars.kind === "status") {
        const prevStatus = vars.app.statusId;
        const states = qc.getQueryData<CanonicalState[]>(statesKey);
        const prevState = states?.find((s) => s.id === prevStatus);
        toast.success(
          `#${data.application.num} ${data.application.company} → ${data.application.statusLabel ?? data.application.statusRaw}`,
          {
            action:
              !vars.isUndo && prevState
                ? {
                    label: "Undo",
                    onClick: () =>
                      mutation.mutate({
                        kind: "status",
                        app: data.application,
                        targetStatusId: prevState.id,
                        isUndo: true,
                      }),
                  }
                : undefined,
          },
        );
        const seed = data.followupSeed;
        if (seed?.result?.seeded) {
          toast.info(
            seed.result.nextDate
              ? `Follow-up pinned for ${seed.result.nextDate}`
              : "Follow-up pinned",
          );
        } else if (seed?.error) {
          toast.warning("Follow-up seeding failed", { description: seed.error });
        }
      } else if (data.notesSanitized) {
        toast.info(`Notes for #${data.application.num} saved (sanitized for the tracker)`);
      } else {
        toast.success(`Notes for #${data.application.num} saved`);
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: applicationsKey });
    },
  });

  return {
    /** Move a row to a canonical status (id). No-op when already there. */
    moveStatus(app: Application, targetStatusId: string, opts?: { isUndo?: boolean }) {
      if (app.statusId === targetStatusId) return;
      mutation.mutate({ kind: "status", app, targetStatusId, isUndo: opts?.isUndo ?? false });
    },
    /** Save the Notes cell (sanitized server-side). */
    saveNotes(app: Application, notes: string) {
      if (notes === app.notes) return;
      mutation.mutate({ kind: "notes", app, notes });
    },
    isPending: mutation.isPending,
  };
}

const followUpWriteResponse = z.object({
  ok: z.literal(true),
  date: z.string(),
  kind: z.enum(["reschedule", "log"]),
  num: z.number().optional(),
});

async function postFollowUp(
  num: number,
  action: "reschedule" | "log",
  body: Record<string, unknown>,
) {
  const res = await fetch(`/api/follow-ups/${num}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return followUpWriteResponse.parse(json);
}

export interface LogFollowUpArgs {
  date?: string;
  channel?: string;
  contact?: string;
  notes?: string;
}

/**
 * Follow-up write actions (reschedule + log-sent). Both invalidate the cadence,
 * the follow-ups list, AND the applications cache (the board's overdue glyph is
 * derived from cadence, so cards refresh too).
 */
export function useFollowUpActions() {
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: followUpCadenceKey });
    void qc.invalidateQueries({ queryKey: followUpsKey });
  };

  const reschedule = useMutation({
    mutationFn: ({ num, date }: { num: number; date: string }) =>
      postFollowUp(num, "reschedule", { date }),
    onSuccess: (data) => {
      invalidate();
      toast.success(`Follow-up rescheduled to ${data.date}`);
    },
    onError: (error) =>
      toast.error("Couldn't reschedule", {
        description: error instanceof Error ? error.message : String(error),
      }),
  });

  const log = useMutation({
    mutationFn: ({ num, ...body }: { num: number } & LogFollowUpArgs) =>
      postFollowUp(num, "log", body),
    onSuccess: (data) => {
      invalidate();
      toast.success(`Follow-up logged for ${data.date}`);
    },
    onError: (error) =>
      toast.error("Couldn't log the follow-up", {
        description: error instanceof Error ? error.message : String(error),
      }),
  });

  return {
    reschedule(num: number, date: string) {
      reschedule.mutate({ num, date });
    },
    logSent(num: number, args: LogFollowUpArgs = {}) {
      log.mutate({ num, ...args });
    },
    isPending: reschedule.isPending || log.isPending,
  };
}
