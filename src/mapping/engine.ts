import { randomUUID } from "crypto";
import type { ClassificationEvidence, ClassificationLabel, ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult } from "../discovery";
import { logicalFieldKeyFromDiscoveryPath } from "./path";
import type {
  DataFlow,
  Dataset,
  DatasetLineageView,
  DuplicateSensitiveGroup,
  FieldLineageReport,
  LineageHop,
  MappedField,
  SourceSystem
} from "./types";
import { stableDatasetId, stableSystemId } from "./ids";

function labelsForFinding(
  classification: ClassificationScanResult | undefined,
  recordIndex: number,
  path: string
): ClassificationLabel[] | undefined {
  if (!classification) return undefined;
  const rec = classification.assignmentsPerRecord.find((r) => r.recordIndex === recordIndex);
  if (!rec) return undefined;

  const labels = new Set<ClassificationLabel>();
  for (const a of rec.assignments) {
    const ev = a.reasoning.evidence.some((e: ClassificationEvidence) => e.discoveryPath === path);
    if (ev) labels.add(a.label);
  }
  if (labels.size === 0) return undefined;
  return [...labels].sort((a, b) => a.localeCompare(b));
}

/**
 * Builds source system, dataset, and per-finding field rows from a discovery scan.
 * Optional classification enriches rows with privacy labels where path-level evidence matches.
 */
export function materializeFromDiscoveryScan(
  discovery: DiscoveryScanResult,
  classification?: ClassificationScanResult
): { system: SourceSystem; dataset: Dataset; fields: MappedField[] } {
  const { sourceType, sourceName, entityName } = discovery.trace;
  const systemId = stableSystemId(sourceType, sourceName);
  const datasetId = stableDatasetId(systemId, entityName);

  const system: SourceSystem = { id: systemId, sourceType, sourceName };
  const dataset: Dataset = { id: datasetId, systemId, entityName };

  const fields: MappedField[] = [];
  for (const perRecord of discovery.findingsPerRecord) {
    for (const f of perRecord.findings) {
      const logicalFieldKey = logicalFieldKeyFromDiscoveryPath(f.path);
      const privacyLabels = labelsForFinding(classification, perRecord.recordIndex, f.path);
      fields.push({
        id: randomUUID(),
        datasetId,
        systemId,
        recordIndex: perRecord.recordIndex,
        jsonPath: f.path,
        logicalFieldKey,
        sensitiveCategory: f.category,
        discoveryMethods: f.methods,
        discoveryConfidence: f.confidence,
        maskedSamplePresent: f.maskedSample !== undefined,
        privacyLabels
      });
    }
  }

  return { system, dataset, fields };
}

function hopFromFlow(flow: DataFlow): LineageHop {
  return {
    flowId: flow.id,
    fromDatasetId: flow.fromDatasetId,
    toDatasetId: flow.toDatasetId,
    flowKind: flow.flowKind,
    description: flow.description
  };
}

function buildAdjacency(flows: DataFlow[]): {
  upstreamByDataset: Map<string, LineageHop[]>;
  downstreamByDataset: Map<string, LineageHop[]>;
} {
  const upstreamByDataset = new Map<string, LineageHop[]>();
  const downstreamByDataset = new Map<string, LineageHop[]>();

  for (const flow of flows) {
    const hop = hopFromFlow(flow);
    const up = upstreamByDataset.get(flow.toDatasetId) ?? [];
    up.push(hop);
    upstreamByDataset.set(flow.toDatasetId, up);

    const down = downstreamByDataset.get(flow.fromDatasetId) ?? [];
    down.push(hop);
    downstreamByDataset.set(flow.fromDatasetId, down);
  }

  return { upstreamByDataset, downstreamByDataset };
}

function collectReachable(
  startDatasetId: string,
  adj: Map<string, LineageHop[]>,
  direction: "upstream" | "downstream"
): LineageHop[] {
  const visited = new Set<string>([startDatasetId]);
  const orderedHops: LineageHop[] = [];
  const queue: string[] = [startDatasetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const hops = adj.get(current) ?? [];
    for (const h of hops) {
      const next = direction === "upstream" ? h.fromDatasetId : h.toDatasetId;
      orderedHops.push(h);
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return orderedHops;
}

export function buildDatasetLineageView(
  datasetId: string,
  systemsById: Map<string, SourceSystem>,
  datasetsById: Map<string, Dataset>,
  flows: DataFlow[]
): DatasetLineageView | undefined {
  const ds = datasetsById.get(datasetId);
  if (!ds) return undefined;
  const system = systemsById.get(ds.systemId);
  if (!system) return undefined;

  const { upstreamByDataset, downstreamByDataset } = buildAdjacency(flows);
  const upstream = collectReachable(datasetId, upstreamByDataset, "upstream");
  const downstream = collectReachable(datasetId, downstreamByDataset, "downstream");

  return { datasetId, system, dataset: ds, upstream, downstream };
}

export function buildFieldLineageReport(
  field: MappedField,
  systemsById: Map<string, SourceSystem>,
  datasetsById: Map<string, Dataset>,
  flows: DataFlow[]
): FieldLineageReport {
  const { upstreamByDataset, downstreamByDataset } = buildAdjacency(flows);
  const upstreamHops = collectReachable(field.datasetId, upstreamByDataset, "upstream");
  const downstreamHops = collectReachable(field.datasetId, downstreamByDataset, "downstream");

  const upstreamDatasetIds = new Set<string>();
  for (const h of upstreamHops) upstreamDatasetIds.add(h.fromDatasetId);

  const downstreamDatasetIds = new Set<string>();
  for (const h of downstreamHops) downstreamDatasetIds.add(h.toDatasetId);

  const upstreamDatasets: DatasetLineageView[] = [];
  for (const id of upstreamDatasetIds) {
    const v = buildDatasetLineageView(id, systemsById, datasetsById, flows);
    if (v) upstreamDatasets.push(v);
  }
  upstreamDatasets.sort((a, b) => a.datasetId.localeCompare(b.datasetId));

  const downstreamDatasets: DatasetLineageView[] = [];
  for (const id of downstreamDatasetIds) {
    const v = buildDatasetLineageView(id, systemsById, datasetsById, flows);
    if (v) downstreamDatasets.push(v);
  }
  downstreamDatasets.sort((a, b) => a.datasetId.localeCompare(b.datasetId));

  return { field, upstreamDatasets, downstreamDatasets };
}

/**
 * Groups sensitive fields that share category + logical key across **multiple** datasets.
 */
export function computeDuplicateSensitiveGroups(fields: MappedField[]): DuplicateSensitiveGroup[] {
  const map = new Map<string, MappedField[]>();
  for (const f of fields) {
    const key = `${f.sensitiveCategory}::${f.logicalFieldKey}`;
    const arr = map.get(key) ?? [];
    arr.push(f);
    map.set(key, arr);
  }

  const out: DuplicateSensitiveGroup[] = [];
  for (const [groupKey, list] of map) {
    const datasetIds = new Set(list.map((x) => x.datasetId));
    if (datasetIds.size < 2) continue;
    const sensitiveCategory = list[0].sensitiveCategory;
    const logicalFieldKey = list[0].logicalFieldKey;
    out.push({
      groupKey,
      sensitiveCategory,
      logicalFieldKey,
      datasetIds: [...datasetIds].sort(),
      fieldIds: list.map((x) => x.id).sort()
    });
  }

  out.sort((a, b) => a.groupKey.localeCompare(b.groupKey));
  return out;
}
