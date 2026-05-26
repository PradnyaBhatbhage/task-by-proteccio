import type { ClassificationLabel } from "../../classification/types";
import type { SensitiveCategory } from "../../discovery";
import type { ComplianceControlDefinition, ComplianceRegulation } from "./types";

export const ALL_REGULATIONS: ComplianceRegulation[] = ["GDPR", "DPDP", "HIPAA", "CCPA", "ISO27001"];

export const REGULATION_LABELS: Record<ComplianceRegulation, string> = {
  GDPR: "General Data Protection Regulation (EU)",
  DPDP: "Digital Personal Data Protection Act (India)",
  HIPAA: "Health Insurance Portability and Accountability Act (US)",
  CCPA: "California Consumer Privacy Act (US)",
  ISO27001: "ISO/IEC 27001 (information security alignment)"
};

/** Discovery category → regulations likely in scope (informational mapping). */
export const CATEGORY_REGULATIONS: Partial<Record<SensitiveCategory, ComplianceRegulation[]>> = {
  aadhaar: ["DPDP", "GDPR", "ISO27001"],
  pan: ["DPDP", "GDPR", "ISO27001"],
  passport: ["GDPR", "DPDP", "CCPA", "ISO27001"],
  payment_card: ["GDPR", "CCPA", "ISO27001"],
  bank_account: ["GDPR", "CCPA", "ISO27001"],
  email: ["GDPR", "DPDP", "CCPA"],
  phone: ["GDPR", "DPDP", "CCPA"],
  person_name: ["GDPR", "DPDP", "CCPA"],
  address: ["GDPR", "DPDP", "CCPA"],
  date_of_birth: ["GDPR", "DPDP", "CCPA"],
  authentication_field: ["GDPR", "DPDP", "ISO27001"],
  ip_address: ["GDPR", "CCPA"]
};

/** Classification label → regulations likely in scope. */
export const LABEL_REGULATIONS: Partial<Record<ClassificationLabel, ComplianceRegulation[]>> = {
  "Personal Data": ["GDPR", "DPDP", "CCPA"],
  "Sensitive Personal Data": ["GDPR", "DPDP"],
  "Financial Data": ["GDPR", "CCPA", "ISO27001"],
  "Health Data": ["HIPAA", "GDPR", "DPDP"],
  "Authentication Data": ["GDPR", "DPDP", "ISO27001"],
  "Organizational Confidential Data": ["ISO27001"]
};

/** Canonical control catalog mapped to one or more regulations. */
export const COMPLIANCE_CONTROL_CATALOG: ComplianceControlDefinition[] = [
  {
    id: "lawful_basis_documented",
    label: "Lawful basis for processing documented",
    regulations: ["GDPR"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data"]
  },
  {
    id: "data_subject_rights",
    label: "Data subject rights process (access, erasure, portability)",
    regulations: ["GDPR"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data"]
  },
  {
    id: "privacy_notice",
    label: "Privacy notice / transparency to data subjects",
    regulations: ["GDPR", "CCPA"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data"]
  },
  {
    id: "consent_management",
    label: "Consent or legitimate-interest management",
    regulations: ["GDPR", "DPDP", "CCPA"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data"]
  },
  {
    id: "data_retention_policy",
    label: "Documented data retention and deletion policy",
    regulations: ["GDPR", "DPDP", "HIPAA", "ISO27001"],
    triggerCategories: ["aadhaar", "pan", "passport", "payment_card", "bank_account"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data", "Health Data", "Financial Data"]
  },
  {
    id: "encryption_at_rest",
    label: "Encryption at rest for sensitive data",
    regulations: ["GDPR", "DPDP", "HIPAA", "CCPA", "ISO27001"],
    triggerLabels: ["Sensitive Personal Data", "Financial Data", "Health Data", "Authentication Data"]
  },
  {
    id: "encryption_in_transit",
    label: "Encryption in transit (TLS / secure channels)",
    regulations: ["GDPR", "DPDP", "HIPAA", "CCPA", "ISO27001"],
    triggerLabels: ["Sensitive Personal Data", "Financial Data", "Health Data", "Authentication Data"]
  },
  {
    id: "access_controls",
    label: "Role-based access controls and least privilege",
    regulations: ["GDPR", "DPDP", "HIPAA", "CCPA", "ISO27001"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data", "Health Data", "Authentication Data"]
  },
  {
    id: "breach_notification",
    label: "Breach detection and notification process",
    regulations: ["GDPR", "DPDP", "HIPAA"],
    triggerLabels: ["Sensitive Personal Data", "Health Data", "Financial Data"]
  },
  {
    id: "data_minimization",
    label: "Data minimization — collect only necessary fields",
    regulations: ["GDPR", "DPDP"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data"]
  },
  {
    id: "purpose_limitation",
    label: "Purpose limitation documented for processing",
    regulations: ["GDPR", "DPDP"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data"]
  },
  {
    id: "cross_border_transfer_safeguards",
    label: "Cross-border transfer safeguards (SCCs / adequacy)",
    regulations: ["GDPR", "DPDP"],
    triggerLabels: ["Sensitive Personal Data"]
  },
  {
    id: "data_principal_rights",
    label: "Data principal rights handling (India DPDP)",
    regulations: ["DPDP"],
    triggerCategories: ["aadhaar", "pan"],
    triggerLabels: ["Sensitive Personal Data", "Personal Data"]
  },
  {
    id: "significant_data_fiduciary_readiness",
    label: "Significant Data Fiduciary readiness (DPDP)",
    regulations: ["DPDP"],
    triggerCategories: ["aadhaar"],
    triggerLabels: ["Sensitive Personal Data"]
  },
  {
    id: "phi_access_controls",
    label: "PHI access controls (minimum necessary)",
    regulations: ["HIPAA"],
    triggerLabels: ["Health Data"]
  },
  {
    id: "phi_audit_logging",
    label: "PHI access audit logging",
    regulations: ["HIPAA"],
    triggerLabels: ["Health Data"]
  },
  {
    id: "baa_agreements",
    label: "Business Associate Agreements for PHI processors",
    regulations: ["HIPAA"],
    triggerLabels: ["Health Data"]
  },
  {
    id: "minimum_necessary",
    label: "Minimum necessary PHI disclosure policy",
    regulations: ["HIPAA"],
    triggerLabels: ["Health Data"]
  },
  {
    id: "opt_out_sale_sharing",
    label: "Opt-out of sale/sharing (CCPA)",
    regulations: ["CCPA"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data"]
  },
  {
    id: "reasonable_security",
    label: "Reasonable security practices (CCPA)",
    regulations: ["CCPA"],
    triggerLabels: ["Personal Data", "Financial Data"]
  },
  {
    id: "consumer_disclosure",
    label: "Consumer disclosure at collection (CCPA)",
    regulations: ["CCPA"],
    triggerLabels: ["Personal Data"]
  },
  {
    id: "isms_documented",
    label: "Documented ISMS policies (ISO 27001 alignment)",
    regulations: ["ISO27001"],
    triggerLabels: ["Authentication Data", "Organizational Confidential Data"]
  },
  {
    id: "risk_assessment",
    label: "Information security risk assessment",
    regulations: ["ISO27001"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data", "Authentication Data"]
  },
  {
    id: "asset_inventory",
    label: "Asset / dataset inventory and lineage",
    regulations: ["ISO27001"],
    triggerLabels: ["Personal Data", "Sensitive Personal Data", "Authentication Data"]
  }
];

export const REMEDIATION_BY_CONTROL: Partial<Record<string, string>> = {
  lawful_basis_documented:
    "Document lawful basis (consent, contract, legal obligation, etc.) per processing activity in your RoPA.",
  data_subject_rights:
    "Implement DSAR workflows for access, rectification, erasure, and portability within statutory timelines.",
  privacy_notice:
    "Publish an up-to-date privacy notice covering purposes, categories, retention, and rights.",
  consent_management:
    "Deploy consent capture, withdrawal, and audit trails aligned with applicable regulation.",
  data_retention_policy:
    "Define and enforce retention schedules; automate deletion for Aadhaar, PAN, and other regulated identifiers.",
  encryption_at_rest:
    "Enable encryption at rest (KMS, TDE, or field-level encryption) for all sensitive datasets.",
  encryption_in_transit:
    "Require TLS 1.2+ for all API and replication paths carrying personal or health data.",
  access_controls:
    "Apply RBAC/ABAC, remove public ACLs, and restrict sensitive datasets to authorized roles only.",
  breach_notification:
    "Establish incident response playbooks with regulatory notification timelines (72h GDPR, DPDP Board, HIPAA).",
  data_minimization:
    "Remove unused sensitive columns and stop ingesting fields not required for the stated purpose.",
  purpose_limitation:
    "Map each dataset to a documented processing purpose; block secondary use without reassessment.",
  cross_border_transfer_safeguards:
    "Execute Standard Contractual Clauses or verify adequacy before cross-border transfers.",
  data_principal_rights:
    "Implement DPDP data-principal request handling including grievance and nomination rights.",
  significant_data_fiduciary_readiness:
    "Assess Significant Data Fiduciary obligations (DPO, DPIA, audits) for large-scale Aadhaar processing.",
  phi_access_controls:
    "Restrict PHI to clinical roles; enforce break-glass procedures and periodic access reviews.",
  phi_audit_logging:
    "Enable immutable audit logs for all PHI read/write operations.",
  baa_agreements:
    "Execute BAAs with all vendors that store or process PHI, including backup and analytics providers.",
  minimum_necessary:
    "Limit PHI fields to the minimum needed for each workflow; mask or tokenize where possible.",
  opt_out_sale_sharing:
    "Provide a clear 'Do Not Sell or Share' mechanism and honor opt-out signals.",
  reasonable_security:
    "Adopt CIS/NIST-aligned controls; remediate public exposure and missing encryption immediately.",
  consumer_disclosure:
    "Disclose categories collected and purposes at or before collection for California consumers.",
  isms_documented:
    "Maintain ISO 27001-aligned ISMS documentation covering scope, policies, and roles.",
  risk_assessment:
    "Run periodic information-security risk assessments and track treatment plans to closure.",
  asset_inventory:
    "Register all sensitive datasets in the governance catalog with lineage and ownership."
};
