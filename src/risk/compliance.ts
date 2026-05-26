import type { ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult } from "../discovery";
import { analyzeComplianceIntelligence } from "./compliance/engine";
import type { ComplianceIntelligenceReport } from "./compliance/types";
import type { ComplianceExposureScore, RiskExposureHints, RiskFactorContribution } from "./types";

export type { ComplianceIntelligenceReport, ComplianceControlHints, ComplianceRegulation } from "./compliance/types";
export { analyzeComplianceIntelligence } from "./compliance/engine";
export {
  ALL_REGULATIONS,
  COMPLIANCE_CONTROL_CATALOG,
  REGULATION_LABELS
} from "./compliance/regulations";

/**
 * Estimates compliance/regulatory exposure from classification labels, volume,
 * and exposure-related risk factors (informational scoring, not legal advice).
 */
export function computeComplianceExposure(
  discovery: DiscoveryScanResult,
  classification: ClassificationScanResult | undefined,
  factorContributions: RiskFactorContribution[],
  hints?: RiskExposureHints
): ComplianceExposureScore {
  return analyzeComplianceIntelligence({
    discovery,
    classification,
    factorContributions,
    hints,
    controlHints: hints?.complianceControls
  }).exposure;
}

/**
 * Full compliance intelligence: regulations, control gaps, flags, remediation.
 */
export function computeComplianceIntelligence(
  discovery: DiscoveryScanResult,
  classification: ClassificationScanResult | undefined,
  factorContributions: RiskFactorContribution[],
  hints?: RiskExposureHints
): ComplianceIntelligenceReport {
  return analyzeComplianceIntelligence({
    discovery,
    classification,
    factorContributions,
    hints,
    controlHints: hints?.complianceControls
  });
}
