import type { ClassificationLabel } from "../classification/types";
import type { SensitiveCategory, SourceType } from "../discovery";
import type { DatasetLineageView } from "../mapping/types";
import type { RemediationTicket } from "../remediation/types";
import type { ComplianceRegulation, ComplianceStatus } from "../risk/compliance/types";
import type { RiskLevel } from "../risk/types";
import type { GovernanceDatasetSnapshot } from "../catalog/types";

export type SearchSortField =
  | "updatedAt"
  | "riskScore"
  | "riskLevel"
  | "sourceName"
  | "complianceScore";

export type SortOrder = "asc" | "desc";

export type ClassificationMatchMode = "and" | "or";
export type DetectionMatchMode = "and" | "or";

export interface DatasetSearchQuery {
  /** Single risk level (legacy). */
  riskLevel?: RiskLevel;
  /** Multiple risk levels (OR). */
  riskLevels?: RiskLevel[];
  minRiskScore?: number;
  maxRiskScore?: number;
  /** Single classification label (legacy). */
  classificationLabel?: ClassificationLabel;
  /** Multiple labels — combined per `classificationMode`. */
  classificationLabels?: ClassificationLabel[];
  classificationMode?: ClassificationMatchMode;
  sourceType?: SourceType;
  sourceNameContains?: string;
  systemId?: string;
  datasetId?: string;
  /** Single detection category (legacy). */
  detectionCategory?: SensitiveCategory;
  /** Multiple categories — combined per `detectionMode`. */
  detectionCategories?: SensitiveCategory[];
  detectionMode?: DetectionMatchMode;
  mappedOnly?: boolean;
  /** Filter by regulation with compliance gaps (violations, flags, or non-compliant status). */
  complianceRegulation?: ComplianceRegulation;
  /** When true with `complianceRegulation`, only datasets with explicit violations/flags for that regulation. */
  complianceViolation?: boolean;
  complianceStatus?: ComplianceStatus;
  /** Datasets linked to open or in-progress remediation tickets. */
  hasUnresolvedRemediation?: boolean;
  /** Case-insensitive keyword across safe metadata fields. */
  keyword?: string;
  sortBy?: SearchSortField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
  /** Opaque cursor from a previous response (`nextCursor`). */
  cursor?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  sortBy?: SearchSortField;
  sortOrder?: SortOrder;
  nextCursor?: string;
  hasMore: boolean;
}

export type DatasetSearchResult = PaginatedResult<GovernanceDatasetSnapshot>;

export interface LineageSearchQuery {
  datasetId?: string;
  systemId?: string;
  direction?: "upstream" | "downstream" | "both";
  flowKind?: string;
  relatedSourceName?: string;
  page?: number;
  pageSize?: number;
}

export interface LineageSearchHit {
  anchorDatasetId: string;
  view: DatasetLineageView;
  matchedHopCount: number;
}

export type LineageSearchResult = PaginatedResult<LineageSearchHit>;

export interface RemediationSearchQuery {
  status?: RemediationTicket["status"];
  severity?: RemediationTicket["severity"];
  datasetId?: string;
  keyword?: string;
  unresolved?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: "updatedAt" | "severity" | "createdAt";
  sortOrder?: SortOrder;
  cursor?: string;
}

export type RemediationSearchResult = PaginatedResult<RemediationTicket>;

export type GlobalSearchEntityType = "datasets" | "fields" | "remediation" | "lineage" | "sources";

export interface GlobalSearchQuery {
  keyword: string;
  types?: GlobalSearchEntityType[];
  page?: number;
  pageSize?: number;
}

export interface GlobalSearchBucket<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GlobalSearchResult {
  query: string;
  datasets: GlobalSearchBucket<GovernanceDatasetSnapshot>;
  fields: GlobalSearchBucket<import("../mapping/types").MappedField>;
  remediation: GlobalSearchBucket<RemediationTicket>;
  lineage: GlobalSearchBucket<LineageSearchHit>;
  sources: GlobalSearchBucket<import("../mapping/types").SourceSystem>;
}
