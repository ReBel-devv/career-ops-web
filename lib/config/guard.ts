/**
 * Build/deploy safety guard.
 *
 * The dashboard reads a real, private job-search repo when run locally.
 * Deploying that data is structurally impossible: a production build on
 * Vercel MUST be a demo build. `next.config.ts` calls `assertDeployGuard`
 * at config-load time, so `next build` fails fast when `VERCEL` is set
 * and `DEMO_MODE` is not enabled.
 */

/** Values accepted as "true" for boolean-ish env vars. */
const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) return false;
  return TRUTHY.has(value.trim().toLowerCase());
}

/** Env-var bag — structurally compatible with `process.env`. */
export type EnvVars = Readonly<Record<string, string | undefined>>;

/**
 * Throws when building on Vercel without DEMO_MODE — the only supported
 * public deployment is the fixture-backed demo.
 */
export function assertDeployGuard(env: EnvVars): void {
  const onVercel = env.VERCEL !== undefined && env.VERCEL.trim() !== "";
  if (onVercel && !isTruthyEnv(env.DEMO_MODE)) {
    throw new Error(
      "career-ops-web: refusing to build on Vercel without DEMO_MODE=true. " +
        "Public deployments must serve fixture data only — set DEMO_MODE=true " +
        "in the Vercel project environment, or build locally for private use.",
    );
  }
}
