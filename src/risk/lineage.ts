import type { DiscoveryScanResult } from "../discovery";
import { mappingRegistry, stableDatasetId, stableSystemId } from "../mapping";
import type { RiskExposureHints } from "./types";

/**
 * Merges caller-provided exposure hints with lineage-derived hints from the mapping registry.
 */
export function mergeExposureHintsForDiscovery(
  discovery: DiscoveryScanResult,
  hints?: RiskExposureHints
): RiskExposureHints {
  const systemId = stableSystemId(discovery.trace.sourceType, discovery.trace.sourceName);
  const datasetId = stableDatasetId(systemId, discovery.trace.entityName);
  const flows = mappingRegistry.listFlows();
  const downstream = flows.filter((f) => f.fromDatasetId === datasetId);
  const lineage: RiskExposureHints = {
    hasApiExposureFlow: downstream.some((f) => f.flowKind === "api_exposure"),
    hasReplicationOrBackupFlow: downstream.some((f) => f.flowKind === "replication" || f.flowKind === "backup")
  };
  return {
    hasApiExposureFlow: Boolean(lineage.hasApiExposureFlow || hints?.hasApiExposureFlow),
    hasReplicationOrBackupFlow: Boolean(lineage.hasReplicationOrBackupFlow || hints?.hasReplicationOrBackupFlow)
  };
}
