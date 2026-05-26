export type {
  ComplianceControlHints,
  ComplianceExposureScore,
  ComplianceIntelligenceReport,
  ComplianceRegulation,
  HighRiskDatasetFlag,
  OverexposedSensitiveRecord,
  PrivacyRiskAnalysis,
  RiskAssessment,
  RiskExposureHints,
  RiskFactorContribution,
  RiskFactorId,
  RiskLevel,
  RiskPrioritizationItem,
  RiskScoringWeights,
  SourceRiskAggregation,
  SystemRiskAggregation
} from "./types";
export { DEFAULT_RISK_WEIGHTS } from "./types";
export { assessRisk, analyzePrivacyRisk, enrichExposureHints } from "./engine";
export { mergeExposureHintsForDiscovery } from "./lineage";
export { aggregateRiskBySource, aggregateRiskBySystem } from "./aggregation";
export { buildRiskPrioritization, identifyHighRiskDatasets } from "./prioritization";
export { detectOverexposedRecords } from "./overexposure";
export {
  computeComplianceExposure,
  computeComplianceIntelligence,
  analyzeComplianceIntelligence,
  ALL_REGULATIONS,
  COMPLIANCE_CONTROL_CATALOG,
  REGULATION_LABELS
} from "./compliance";
export { RISK_FACTOR_COMPUTERS, comboCriticalFromDiscovery } from "./factors";
