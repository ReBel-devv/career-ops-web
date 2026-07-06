import { getConfig, requireCareerOpsPath } from "@/lib/config";
import type { DataSource } from "./data-source";
import { DemoDataSource } from "./demo-data-source";
import { FsDataSource } from "./fs-data-source";

/**
 * Resolve the active DataSource from the environment on every call —
 * env-driven, cheap to construct, and keeps request-time semantics.
 */
export function getDataSource(): DataSource {
  const config = getConfig();
  if (config.demoMode) return new DemoDataSource();
  return new FsDataSource(requireCareerOpsPath());
}

export type { DataSource } from "./data-source";
export { DemoDataSource } from "./demo-data-source";
export { FsDataSource } from "./fs-data-source";
export {
  loadTrackerParse,
  loadTrackerUtils,
  type TrackerParseModule,
  type TrackerRow,
  type TrackerUtilsModule,
} from "./tracker-module";
