import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { updateProfileFieldInputSchema } from "@/lib/domain";
import { readOnlyGuard } from "@/lib/api/follow-up-error";
import { profileErrorResponse } from "@/lib/api/profile-error";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/profile — parsed profile.yml + source documents + profile texts. */
export async function GET(): Promise<NextResponse> {
  try {
    const data = await getDataSource().getProfile();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/profile — edit ONE scalar field of config/profile.yml.
 * Body: `{ field, value, expected? }`. Surgical + comment-preserving; guarded
 * by optimistic concurrency (`expected`). Returns the re-parsed profile.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const guard = readOnlyGuard();
  if (guard) return guard;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = updateProfileFieldInputSchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      {
        error: body.error.issues[0]?.message ?? "Invalid request body",
        issues: body.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const profile = await getDataSource().updateProfileField(body.data);
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    return profileErrorResponse(error);
  }
}
