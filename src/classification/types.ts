import type { Confidence as DiscoveryConfidence, DetectionMethod, SensitiveCategory, SourceTrace } from "../discovery";

export type ClassificationLabel =
  | "Personal Data"
  | "Sensitive Personal Data"
  | "Financial Data"
  | "Health Data"
  | "Authentication Data"
  | "Organizational Confidential Data"
  | "Public Data";

export type ClassificationConfidence = number; // 0..1

export type ClassificationRuleId = "discovery_category_mapping" | "health_field_context";

export interface ClassificationEvidence {
  discoveryCategory: SensitiveCategory;
  discoveryMethods: DetectionMethod[];
  discoveryConfidence: DiscoveryConfidence;
  discoveryPath: string;
  maskedSamplePresent?: boolean;
}

export interface ClassificationReasoning {
  ruleId: ClassificationRuleId;
  why: string;
  evidence: ClassificationEvidence[];
}

export interface ClassificationAssignment {
  /**
   * Best-effort field name derived from the discovery path.
   * Example: `root.aadhaar_number` -> `aadhaar_number`
   */
  field: string;
  label: ClassificationLabel;
  confidence: ClassificationConfidence;
  reasoning: ClassificationReasoning;
}

export interface ClassificationRecordResult {
  recordIndex: number;
  assignments: ClassificationAssignment[];
}

export interface ClassificationScanResult {
  trace: Omit<SourceTrace, "recordIndex">;
  scannedRecords: number;
  assignmentsPerRecord: ClassificationRecordResult[];
  summary: Partial<Record<ClassificationLabel, number>>;
}

export interface ClassificationOptions {
  /**
   * Keep reasoning evidence output stable and bounded for very large scans.
   * Default: 10
   */
  maxEvidencePerAssignment?: number;
  /**
   * Default: true
   */
  includeReasoning?: boolean;
}

