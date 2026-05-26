import type { DiscoveryScanResult } from "../discovery";
import type { ProfilingReport } from "../profiling";
import { enrichExposureHints } from "./engine";
import type { RiskExposureHints } from "./types";

/**
 * Merges caller-provided exposure hints with lineage-derived hints from the mapping registry.
 */
export function mergeExposureHintsForDiscovery(
  discovery: DiscoveryScanResult,
  hints?: RiskExposureHints,
  profile?: ProfilingReport
): RiskExposureHints {
  return enrichExposureHints(discovery, hints, profile);
}
