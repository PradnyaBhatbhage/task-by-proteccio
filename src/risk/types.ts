export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskExposureHints {
  /** True if lineage indicates this dataset is exposed via an API-style flow. */
  hasApiExposureFlow?: boolean;
  /** True if dataset participates in replication/backup flows (broader blast radius). */
  hasReplicationOrBackupFlow?: boolean;
}

export interface RiskAssessment {
  level: RiskLevel;
  /** 0..100 normalized score for dashboards and sorting. */
  score: number;
  factors: string[];
  exposureHintsApplied?: RiskExposureHints;
}
