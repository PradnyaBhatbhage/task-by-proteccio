import type { ClassificationLabel } from "../classification/types";
import type { DiscoveryScanResult, SensitiveCategory, SourceType } from "../discovery";
import type { ProfilingReport } from "../profiling";
import type { RiskAssessment } from "../risk";

export interface GovernanceDatasetSnapshot {
  datasetId: string;
  systemId: string;
  trace: DiscoveryScanResult["trace"];
  createdAt: string;
  updatedAt: string;
  profile: ProfilingReport;
  risk: RiskAssessment;
  /** Aggregate discovery counts (safe metadata). */
  discoveryCategoryTotals: Partial<Record<SensitiveCategory, number>>;
  /** Aggregate classification counts (safe metadata). */
  classificationTotals: Partial<Record<ClassificationLabel, number>>;
  sensitiveRecordCount: number;
  totalRecords: number;
  riskLevel: RiskAssessment["level"];
  /** True if this dataset id exists in the mapping registry (checked at query time). */
  mapped: boolean;
}

export interface CatalogQuery {
  riskLevel?: RiskAssessment["level"];
  classificationLabel?: ClassificationLabel;
  sourceType?: SourceType;
  sourceNameContains?: string;
  detectionCategory?: SensitiveCategory;
  mappedOnly?: boolean;
  page?: number;
  pageSize?: number;
}
