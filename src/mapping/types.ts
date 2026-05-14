/**
 * Data mapping domain types: field-to-source linkage, flows, lineage, and duplicate detection.
 * Designed for in-memory MVP with stable shapes for future persistence and reporting exports.
 */

import type { ClassificationLabel } from "../classification/types";
import type { Confidence, DetectionMethod, SensitiveCategory, SourceType } from "../discovery";

/** Stable reference to a logical system (database host, bucket account, API base, etc.). */
export interface SourceSystem {
  id: string;
  sourceType: SourceType;
  sourceName: string;
}

/**
 * A dataset is a concrete entity within a system (table, object key, collection, endpoint resource).
 * Maps 1:1 with discovery `trace` minus record index.
 */
export interface Dataset {
  id: string;
  systemId: string;
  entityName: string;
}

/** One discovered sensitive field occurrence with traceability back to scan inputs. */
export interface MappedField {
  id: string;
  datasetId: string;
  systemId: string;
  recordIndex: number;
  /** JSON-path style location within the record. */
  jsonPath: string;
  /** Best-effort logical key (e.g. last segment of path), aligned with classification `field`. */
  logicalFieldKey: string;
  sensitiveCategory: SensitiveCategory;
  discoveryMethods: DetectionMethod[];
  discoveryConfidence: Confidence;
  maskedSamplePresent: boolean;
  /** Privacy labels inferred from classification when provided. */
  privacyLabels?: ClassificationLabel[];
}

/** Directed edge between datasets (replication, backup, API surface, ETL, etc.). */
export type DataFlowKind = "replication" | "backup" | "api_exposure" | "etl" | "sync" | "other";

export interface DataFlow {
  id: string;
  fromDatasetId: string;
  toDatasetId: string;
  flowKind: DataFlowKind;
  description?: string;
}

/** One hop in lineage with enough context for reporting. */
export interface LineageHop {
  flowId: string;
  fromDatasetId: string;
  toDatasetId: string;
  flowKind: DataFlowKind;
  description?: string;
}

export interface DatasetLineageView {
  datasetId: string;
  system: SourceSystem;
  dataset: Dataset;
  upstream: LineageHop[];
  downstream: LineageHop[];
}

/** Field-centric lineage: dataset graph + the field row repeated for each touched dataset (future: column-level). */
export interface FieldLineageReport {
  field: MappedField;
  /** BFS-ordered unique datasets reachable via upstream flows from the field's home dataset. */
  upstreamDatasets: DatasetLineageView[];
  /** BFS-ordered unique datasets reachable via downstream flows. */
  downstreamDatasets: DatasetLineageView[];
}

/** Duplicated sensitive semantics across distinct datasets (cross-source visibility). */
export interface DuplicateSensitiveGroup {
  /** Stable grouping key for reporting: `category::logicalFieldKey`. */
  groupKey: string;
  sensitiveCategory: SensitiveCategory;
  logicalFieldKey: string;
  /** Distinct dataset ids where this pattern appears. */
  datasetIds: string[];
  fieldIds: string[];
}

/** Full registry snapshot for scheduled reporting / ETL. */
export interface MappingInventoryExport {
  exportedAt: string;
  systems: SourceSystem[];
  datasets: Dataset[];
  flows: DataFlow[];
  fields: MappedField[];
  duplicateGroups: DuplicateSensitiveGroup[];
}
