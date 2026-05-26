import type { ClassificationLabel } from "../../classification/types";
import type { SensitiveCategory } from "../../discovery";
import type { RiskLevel } from "../types";

/** Supported privacy and security frameworks for compliance intelligence. */
export type ComplianceRegulation = "GDPR" | "DPDP" | "HIPAA" | "CCPA" | "ISO27001";

export type ComplianceStatus = "compliant" | "partial" | "non_compliant" | "not_applicable";

export type ControlEvaluationStatus = "met" | "missing" | "at_risk" | "not_applicable";

export type ComplianceControlId =
  | "lawful_basis_documented"
  | "data_subject_rights"
  | "privacy_notice"
  | "consent_management"
  | "data_retention_policy"
  | "encryption_at_rest"
  | "encryption_in_transit"
  | "access_controls"
  | "breach_notification"
  | "data_minimization"
  | "purpose_limitation"
  | "cross_border_transfer_safeguards"
  | "data_principal_rights"
  | "significant_data_fiduciary_readiness"
  | "phi_access_controls"
  | "phi_audit_logging"
  | "baa_agreements"
  | "minimum_necessary"
  | "opt_out_sale_sharing"
  | "reasonable_security"
  | "consumer_disclosure"
  | "isms_documented"
  | "risk_assessment"
  | "asset_inventory";

/**
 * Optional attestations from governance systems. When omitted, the engine
 * conservatively treats organizational controls as unverified (missing/at_risk).
 */
export interface ComplianceControlHints {
  retentionPolicyIndicated?: boolean;
  consentManagementIndicated?: boolean;
  privacyNoticeIndicated?: boolean;
  lawfulBasisDocumented?: boolean;
  accessControlsIndicated?: boolean;
  breachNotificationProcessIndicated?: boolean;
  dataPrincipalRightsProcessIndicated?: boolean;
  baaInPlace?: boolean;
  phiAuditLoggingIndicated?: boolean;
  optOutMechanismIndicated?: boolean;
  ismsRiskAssessmentIndicated?: boolean;
  purposeLimitationDocumented?: boolean;
  crossBorderSafeguardsIndicated?: boolean;
  consumerDisclosureIndicated?: boolean;
  ismsDocumented?: boolean;
}

export interface ComplianceControlDefinition {
  id: ComplianceControlId;
  label: string;
  regulations: ComplianceRegulation[];
  /** Discovery categories that make this control relevant when present. */
  triggerCategories?: SensitiveCategory[];
  /** Classification labels that make this control relevant when present. */
  triggerLabels?: ClassificationLabel[];
}

export interface ComplianceControlResult {
  id: ComplianceControlId;
  label: string;
  regulation: ComplianceRegulation;
  status: ControlEvaluationStatus;
  reason: string;
}

export interface ComplianceFlag {
  id: string;
  regulation: ComplianceRegulation;
  severity: RiskLevel;
  title: string;
  description: string;
  triggeredBy: string[];
}

export interface RegulationRiskExposure {
  regulation: ComplianceRegulation;
  score: number;
  level: RiskLevel;
  drivingFactors: string[];
}

export interface ComplianceIntelligenceReport {
  status: ComplianceStatus;
  /** 0..100 — higher is better (inverse of regulatory exposure). */
  statusScore: number;
  applicableRegulations: ComplianceRegulation[];
  violatedControls: ComplianceControlResult[];
  missingControls: ComplianceControlResult[];
  atRiskControls: ComplianceControlResult[];
  flags: ComplianceFlag[];
  remediationActions: string[];
  regulatoryRiskExposure: {
    score: number;
    level: RiskLevel;
    byRegulation: RegulationRiskExposure[];
  };
  /** Legacy exposure summary for dashboards and sorting. */
  exposure: {
    score: number;
    level: RiskLevel;
    drivingLabels: ClassificationLabel[];
    frameworks: ComplianceRegulation[];
    factors: string[];
  };
}
