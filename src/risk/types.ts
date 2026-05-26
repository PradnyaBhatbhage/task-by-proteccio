import type { ClassificationLabel } from "../classification/types";
import type { SensitiveCategory, SourceType } from "../discovery";
import type { ComplianceControlHints, ComplianceIntelligenceReport, ComplianceRegulation } from "./compliance/types";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type { ComplianceControlHints, ComplianceIntelligenceReport, ComplianceRegulation } from "./compliance/types";

/** Canonical risk factor identifiers used by the Week 3 scoring engine. */
export type RiskFactorId =
  | "sensitive_data_volume"
  | "sensitive_data_type"
  | "attribute_combination"
  | "public_exposure"
  | "missing_encryption"
  | "duplicate_storage"
  | "orphaned_sensitive_data";

export interface RiskExposureHints {
  /** True if lineage indicates this dataset is exposed via an API-style flow. */
  hasApiExposureFlow?: boolean;
  /** True if dataset participates in replication/backup flows (broader blast radius). */
  hasReplicationOrBackupFlow?: boolean;
  /** Caller indicates the dataset or endpoint is publicly reachable. */
  isPubliclyExposed?: boolean;
  /** When false, sensitive data lacks encryption-at-rest/in-transit indicators. */
  encryptionIndicated?: boolean;
  /** Cross-dataset duplicate sensitive field groups (from mapping registry). */
  crossDatasetDuplicateGroupCount?: number;
  /** Dataset exists in catalog but has no mapping registry entry. */
  unmappedDataset?: boolean;
  /** No inbound/outbound flows reference this dataset. */
  noLineageFlows?: boolean;
  /** Days since last observed scan/update (for stale/orphan heuristics). */
  daysSinceLastActivity?: number;
  /** Optional governance attestations for compliance control evaluation. */
  complianceControls?: ComplianceControlHints;
}

export interface RiskFactorContribution {
  id: RiskFactorId;
  label: string;
  /** Raw contribution before weighting (0..100 scale per factor). */
  rawScore: number;
  /** Weight applied in the composite score (0..1). */
  weight: number;
  /** Weighted points added to the composite score. */
  weightedScore: number;
  severity: RiskLevel;
  details: string[];
}

export interface ComplianceExposureScore {
  /** 0..100 — regulatory/compliance exposure estimate. */
  score: number;
  level: RiskLevel;
  /** Labels driving exposure (from classification). */
  drivingLabels: ClassificationLabel[];
  /** Applicable regulations (informational, not legal advice). */
  frameworks: ComplianceRegulation[];
  factors: string[];
}

export interface OverexposedSensitiveRecord {
  recordIndex: number;
  findingCount: number;
  categories: SensitiveCategory[];
  classificationLabels: ClassificationLabel[];
  exposureScore: number;
  reasons: string[];
}

export interface HighRiskDatasetFlag {
  datasetId: string;
  systemId: string;
  sourceType: SourceType;
  sourceName: string;
  entityName: string;
  riskLevel: RiskLevel;
  riskScore: number;
  complianceScore: number;
  primaryReasons: string[];
}

export interface RiskPrioritizationItem {
  rank: number;
  datasetId: string;
  systemId: string;
  sourceType: SourceType;
  sourceName: string;
  entityName: string;
  riskLevel: RiskLevel;
  riskScore: number;
  complianceScore: number;
  priorityScore: number;
  actionHints: string[];
}

export interface SourceRiskAggregation {
  sourceType: SourceType;
  sourceName: string;
  systemIds: string[];
  datasetCount: number;
  totalRecords: number;
  sensitiveRecordCount: number;
  aggregateRiskScore: number;
  maxRiskLevel: RiskLevel;
  riskLevelDistribution: Record<RiskLevel, number>;
  complianceExposureScore: number;
  topFactors: string[];
}

export interface SystemRiskAggregation {
  systemId: string;
  sourceType: SourceType;
  sourceName: string;
  datasetCount: number;
  totalRecords: number;
  sensitiveRecordCount: number;
  aggregateRiskScore: number;
  maxRiskLevel: RiskLevel;
  complianceExposureScore: number;
}

export interface PrivacyRiskAnalysis {
  datasetId: string;
  systemId: string;
  level: RiskLevel;
  /** 0..100 normalized composite privacy risk score. */
  score: number;
  factors: RiskFactorContribution[];
  /** Legacy string factors for dashboards and audit logs. */
  factorSummaries: string[];
  compliance: ComplianceExposureScore;
  /** Full compliance intelligence (regulations, controls, flags, remediation). */
  complianceIntelligence: ComplianceIntelligenceReport;
  overexposedRecords: OverexposedSensitiveRecord[];
  isHighRiskDataset: boolean;
  highRiskReasons: string[];
  exposureHintsApplied?: RiskExposureHints;
  /** Dynamic weights snapshot used for this run. */
  weightsApplied: Partial<Record<RiskFactorId, number>>;
}

export interface RiskAssessment {
  level: RiskLevel;
  /** 0..100 normalized score for dashboards and sorting. */
  score: number;
  factors: string[];
  exposureHintsApplied?: RiskExposureHints;
  /** Week 3 full analysis payload (present when using analyzePrivacyRisk). */
  analysis?: PrivacyRiskAnalysis;
}

export interface RiskScoringWeights {
  sensitive_data_volume: number;
  sensitive_data_type: number;
  attribute_combination: number;
  public_exposure: number;
  missing_encryption: number;
  duplicate_storage: number;
  orphaned_sensitive_data: number;
}

export const DEFAULT_RISK_WEIGHTS: RiskScoringWeights = {
  sensitive_data_volume: 0.18,
  sensitive_data_type: 0.22,
  attribute_combination: 0.16,
  public_exposure: 0.14,
  missing_encryption: 0.12,
  duplicate_storage: 0.1,
  orphaned_sensitive_data: 0.08
};
