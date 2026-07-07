import { z } from "zod";
import type { FollowupSeedOutcome, TrackerSyncOutcome } from "@/lib/scripts";
import type { Application } from "./application";

/**
 * PATCH /api/applications/[num] — request body. Exactly one writable cell
 * per request (Status or Notes), plus the optimistic-concurrency snapshot
 * of the row as the client saw it.
 */
export const updateApplicationBodySchema = z
  .object({
    status: z.string().min(1).optional(),
    notes: z.string().optional(),
    expected: z.object({
      company: z.string().min(1),
      role: z.string().min(1),
    }),
  })
  .refine((body) => body.status !== undefined || body.notes !== undefined, {
    message: "Provide status or notes.",
  })
  .refine((body) => body.status === undefined || body.notes === undefined, {
    message: "Write one cell at a time: status OR notes.",
  });

export type UpdateApplicationBody = z.infer<typeof updateApplicationBodySchema>;

export interface UpdateApplicationInput {
  num: number;
  expected: { company: string; role: string };
  status?: string;
  notes?: string;
}

export interface UpdateApplicationResult {
  application: Application;
  /** True when the notes were altered by pipe/newline sanitization. */
  notesSanitized: boolean;
  /** Present when the write transitioned the row to Applied. */
  followupSeed?: FollowupSeedOutcome;
  /** Present when a derived applications.db exists and was re-synced. */
  trackerSync?: TrackerSyncOutcome;
}
