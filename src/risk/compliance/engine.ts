import type { ClassificationLabel, ClassificationScanResult } from "../../classification/types";
import type { DiscoveryScanResult, SensitiveCategory } from "../../discovery";
import type { RiskExposureHints, RiskFactorContribution, RiskLevel } from "../types";
import {
  CATEGORY_REGULATIONS,
  COMPLIANCE_CONTROL_CATALOG,
  LABEL_REGULATIONS,
  REMEDIATION_BY_CONTROL
} from "./regulations";
import type {
  ComplianceControlHints,
  ComplianceControlResult,
  ComplianceFlag,
  ComplianceIntelligenceReport,
  ComplianceRegulation,
  ComplianceStatus,
  ControlEvaluationStatus,
  RegulationRiskExposure
} from "./types";

const LABEL_EXPOSURE_WEIGHT: Record<ClassificationLabel, number> = {
  "Public Data": 2,
  "Personal Data": 18,
  "Sensitive Personal Data": 42,
  "Financial Data": 40,
  "Health Data": 38,
  "Authentication Data": 44,
  "Organizational Confidential Data": 28
};

const INDIAN_GOV_IDS: SensitiveCategory[] = ["aadhaar", "pan"];

export interface AnalyzeComplianceInput {
  discovery: DiscoveryScanResult;
  classification?: ClassificationScanResult;
  factorContributions?: RiskFactorContribution[];
  hints?: RiskExposureHints;
  controlHints?: ComplianceControlHints;
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function collectCategories(discovery: DiscoveryScanResult): Set<SensitiveCategory> {
  const s = new Set<SensitiveCategory>();
  for (const [cat, count] of Object.entries(discovery.summary ?? {}) as [SensitiveCategory, number][]) {
    if ((count ?? 0) > 0) s.add(cat);
  }
  return s;
}

function collectLabels(classification: ClassificationScanResult | undefined): Set<ClassificationLabel> {
  const s = new Set<ClassificationLabel>();
  if (!classification) return s;
  for (const [label, count] of Object.entries(classification.summary ?? {}) as [ClassificationLabel, number][]) {
    if ((count ?? 0) > 0) s.add(label);
  }
  return s;
}

function resolveApplicableRegulations(
  categories: Set<SensitiveCategory>,
  labels: Set<ClassificationLabel>
): ComplianceRegulation[] {
  const regs = new Set<ComplianceRegulation>();
  for (const cat of categories) {
    for (const r of CATEGORY_REGULATIONS[cat] ?? []) regs.add(r);
  }
  for (const label of labels) {
    for (const r of LABEL_REGULATIONS[label] ?? []) regs.add(r);
  }
  return [...regs].sort();
}

function controlApplies(
  def: (typeof COMPLIANCE_CONTROL_CATALOG)[number],
  regulations: ComplianceRegulation[],
  categories: Set<SensitiveCategory>,
  labels: Set<ClassificationLabel>
): boolean {
  const regOverlap = def.regulations.some((r) => regulations.includes(r));
  if (!regOverlap) return false;
  const catHit = def.triggerCategories?.some((c) => categories.has(c)) ?? false;
  const labelHit = def.triggerLabels?.some((l) => labels.has(l)) ?? false;
  if (!def.triggerCategories?.length && !def.triggerLabels?.length) return regOverlap;
  return catHit || labelHit;
}

function hintForControl(
  id: string,
  controlHints?: ComplianceControlHints
): boolean | undefined {
  if (!controlHints) return undefined;
  const map: Record<string, keyof ComplianceControlHints | undefined> = {
    lawful_basis_documented: "lawfulBasisDocumented",
    data_subject_rights: "dataPrincipalRightsProcessIndicated",
    privacy_notice: "privacyNoticeIndicated",
    consent_management: "consentManagementIndicated",
    data_retention_policy: "retentionPolicyIndicated",
    encryption_at_rest: undefined,
    encryption_in_transit: undefined,
    access_controls: "accessControlsIndicated",
    breach_notification: "breachNotificationProcessIndicated",
    data_minimization: undefined,
    purpose_limitation: "purposeLimitationDocumented",
    cross_border_transfer_safeguards: "crossBorderSafeguardsIndicated",
    data_principal_rights: "dataPrincipalRightsProcessIndicated",
    significant_data_fiduciary_readiness: "dataPrincipalRightsProcessIndicated",
    phi_access_controls: "accessControlsIndicated",
    phi_audit_logging: "phiAuditLoggingIndicated",
    baa_agreements: "baaInPlace",
    minimum_necessary: undefined,
    opt_out_sale_sharing: "optOutMechanismIndicated",
    reasonable_security: "accessControlsIndicated",
    consumer_disclosure: "consumerDisclosureIndicated",
    isms_documented: "ismsDocumented",
    risk_assessment: "ismsRiskAssessmentIndicated",
    asset_inventory: undefined
  };
  const key = map[id];
  if (!key) return undefined;
  return controlHints[key];
}

function evaluateControl(
  controlId: string,
  regulation: ComplianceRegulation,
  label: string,
  ctx: {
    categories: Set<SensitiveCategory>;
    labels: Set<ClassificationLabel>;
    hints?: RiskExposureHints;
    controlHints?: ComplianceControlHints;
    factorContributions: RiskFactorContribution[];
    discovery: DiscoveryScanResult;
  }
): { status: ControlEvaluationStatus; reason: string } {
  const { categories, labels, hints, controlHints, factorContributions, discovery } = ctx;
  const publicFactor = factorContributions.find((f) => f.id === "public_exposure");
  const encryptionFactor = factorContributions.find((f) => f.id === "missing_encryption");
  const publiclyExposed =
    Boolean(hints?.isPubliclyExposed) || (publicFactor?.rawScore ?? 0) >= 40 || discovery.trace.sourceType === "api";
  const encryptionMissing =
    hints?.encryptionIndicated === false || (encryptionFactor?.rawScore ?? 0) >= 30;
  const attested = hintForControl(controlId, controlHints);

  switch (controlId) {
    case "encryption_at_rest":
      if (encryptionMissing) {
        return { status: "at_risk", reason: "Sensitive data lacks encryption-at-rest indicators." };
      }
      if (hints?.encryptionIndicated === true) {
        return { status: "met", reason: "Encryption at rest is indicated for this dataset." };
      }
      return { status: "missing", reason: "Encryption at rest not verified for classified sensitive data." };

    case "encryption_in_transit":
      if (publiclyExposed && encryptionMissing) {
        return { status: "at_risk", reason: "Public or API-exposed path without verified transport encryption." };
      }
      if (hints?.encryptionIndicated === true && !publiclyExposed) {
        return { status: "met", reason: "Transport encryption indicated and exposure is limited." };
      }
      if (publiclyExposed) {
        return { status: "at_risk", reason: "Dataset is API/public reachable — verify TLS on all paths." };
      }
      return { status: "missing", reason: "Encryption in transit not attested for sensitive data flows." };

    case "access_controls":
      if (publiclyExposed) {
        return { status: "at_risk", reason: "Sensitive data appears publicly or API-exposed without access restriction." };
      }
      if (attested === true) return { status: "met", reason: "Access controls attested by governance metadata." };
      if (attested === false) return { status: "missing", reason: "Access controls not documented for this dataset." };
      return { status: "missing", reason: "Role-based access controls not verified." };

    case "asset_inventory":
      if (hints?.unmappedDataset) {
        return { status: "missing", reason: "Dataset is not registered in the mapping/asset inventory." };
      }
      if (hints?.noLineageFlows && labels.size > 0) {
        return { status: "at_risk", reason: "Classified data exists but no lineage flows are documented." };
      }
      if (!hints?.unmappedDataset && hints?.noLineageFlows !== true) {
        return { status: "met", reason: "Dataset is mapped with lineage flows in the governance registry." };
      }
      return { status: "missing", reason: "Asset inventory / lineage not verified." };

    case "data_retention_policy":
      if (attested === true) return { status: "met", reason: "Retention policy attested for this dataset." };
      if (INDIAN_GOV_IDS.some((c) => categories.has(c))) {
        return {
          status: "missing",
          reason: "Government identifiers (e.g. Aadhaar) detected without verified retention policy."
        };
      }
      if (labels.has("Health Data") || labels.has("Sensitive Personal Data")) {
        return { status: "missing", reason: "Sensitive/health data requires documented retention and deletion." };
      }
      return { status: "missing", reason: "Retention policy not attested for personal data processing." };

    case "baa_agreements":
      if (hints?.hasReplicationOrBackupFlow && attested !== true) {
        return { status: "missing", reason: "PHI replication/backup flow without verified Business Associate Agreement." };
      }
      if (attested === true) return { status: "met", reason: "BAA coverage attested for PHI processors." };
      if (labels.has("Health Data")) {
        return { status: "missing", reason: "Health data present — BAA status not verified with vendors." };
      }
      return { status: "not_applicable", reason: "No PHI replication flows detected." };

    case "phi_access_controls":
    case "minimum_necessary":
      if (!labels.has("Health Data")) return { status: "not_applicable", reason: "No health data classification." };
      if (publiclyExposed) {
        return { status: "at_risk", reason: "Health-related data with public/API exposure violates minimum necessary." };
      }
      if (attested === true) return { status: "met", reason: "PHI access restrictions attested." };
      return { status: "missing", reason: "PHI access controls not verified." };

    case "phi_audit_logging":
      if (!labels.has("Health Data")) return { status: "not_applicable", reason: "No health data classification." };
      if (attested === true) return { status: "met", reason: "PHI audit logging attested." };
      return { status: "missing", reason: "PHI access audit logging not verified." };

    case "significant_data_fiduciary_readiness":
      if (!categories.has("aadhaar")) {
        return { status: "not_applicable", reason: "No Aadhaar-scale processing detected." };
      }
      if (attested === true) return { status: "met", reason: "Data fiduciary readiness attested." };
      return {
        status: "at_risk",
        reason: "Aadhaar detected — assess Significant Data Fiduciary obligations under DPDP."
      };

    case "reasonable_security":
      if (publiclyExposed || encryptionMissing) {
        return { status: "at_risk", reason: "Public exposure or missing encryption undermines reasonable security." };
      }
      if (attested === true) return { status: "met", reason: "Security practices attested." };
      return { status: "missing", reason: "Reasonable security practices not verified (CCPA)." };

    case "data_minimization": {
      const findingCount = discovery.findingsPerRecord.reduce((n, r) => n + r.findings.length, 0);
      const recordCount = Math.max(1, discovery.scannedRecords);
      const avgFindings = findingCount / recordCount;
      if (avgFindings >= 6) {
        return { status: "at_risk", reason: `High sensitive-field density (${avgFindings.toFixed(1)} avg/record) suggests over-collection.` };
      }
      return { status: "met", reason: "Sensitive field density within expected minimization bounds." };
    }

    default:
      if (attested === true) return { status: "met", reason: `${label} attested by governance controls.` };
      if (attested === false) return { status: "missing", reason: `${label} explicitly marked as not in place.` };
      return { status: "missing", reason: `${label} not verified — treat as gap until attested.` };
  }
}

function buildFlags(
  categories: Set<SensitiveCategory>,
  labels: Set<ClassificationLabel>,
  controls: ComplianceControlResult[],
  hints?: RiskExposureHints,
  factorContributions: RiskFactorContribution[] = []
): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  const publicFactor = factorContributions.find((f) => f.id === "public_exposure");
  const publiclyExposed =
    Boolean(hints?.isPubliclyExposed) || (publicFactor?.rawScore ?? 0) >= 40;

  const retentionMissing = controls.some(
    (c) => c.id === "data_retention_policy" && c.regulation === "DPDP" && c.status === "missing"
  );
  if (categories.has("aadhaar") && retentionMissing) {
    flags.push({
      id: "dpdp_aadhaar_retention",
      regulation: "DPDP",
      severity: "high",
      title: "DPDP: Aadhaar without retention policy",
      description:
        "Aadhaar (government identifier) was discovered but no retention/deletion policy is attested. This elevates DPDP compliance risk.",
      triggeredBy: ["category:aadhaar", "control:data_retention_policy:missing"]
    });
  }

  if (labels.has("Health Data") && publiclyExposed) {
    flags.push({
      id: "hipaa_health_public_exposure",
      regulation: "HIPAA",
      severity: "critical",
      title: "HIPAA: Health data with public exposure",
      description:
        "Health-classified data combined with public or API exposure indicates potential unauthorized PHI disclosure.",
      triggeredBy: ["label:Health Data", "signal:public_exposure"]
    });
  }

  if (categories.has("payment_card") && publiclyExposed) {
    flags.push({
      id: "ccpa_financial_exposure",
      regulation: "CCPA",
      severity: "high",
      title: "CCPA: Financial identifiers exposed",
      description: "Payment card data with elevated exposure may violate reasonable security expectations under CCPA.",
      triggeredBy: ["category:payment_card", "signal:public_exposure"]
    });
  }

  if (labels.has("Sensitive Personal Data") && controls.some((c) => c.id === "encryption_at_rest" && c.status !== "met")) {
    flags.push({
      id: "gdpr_sensitive_encryption",
      regulation: "GDPR",
      severity: "high",
      title: "GDPR: Sensitive personal data without encryption",
      description: "Sensitive personal data lacks verified encryption controls (Art. 32 security of processing).",
      triggeredBy: ["label:Sensitive Personal Data", "control:encryption_at_rest"]
    });
  }

  if (hints?.unmappedDataset && labels.size > 0) {
    flags.push({
      id: "iso27001_unmapped_asset",
      regulation: "ISO27001",
      severity: "medium",
      title: "ISO 27001: Unmapped sensitive asset",
      description: "Classified sensitive dataset is absent from the asset inventory / mapping registry.",
      triggeredBy: ["hint:unmappedDataset"]
    });
  }

  return flags;
}

function deriveStatus(
  regulations: ComplianceRegulation[],
  violated: ComplianceControlResult[],
  missing: ComplianceControlResult[],
  atRisk: ComplianceControlResult[],
  flags: ComplianceFlag[]
): ComplianceStatus {
  if (regulations.length === 0) return "not_applicable";
  const criticalFlag = flags.some((f) => f.severity === "critical");
  const highViolations = violated.filter((c) => c.status === "at_risk").length + atRisk.length;
  if (criticalFlag || violated.length >= 3) return "non_compliant";
  if (violated.length > 0 || missing.length > 0 || highViolations >= 2) return "partial";
  if (missing.length === 0 && atRisk.length === 0) return "compliant";
  return "partial";
}

function regulationExposure(
  regulation: ComplianceRegulation,
  controls: ComplianceControlResult[],
  flags: ComplianceFlag[],
  baseExposure: number
): RegulationRiskExposure {
  const regControls = controls.filter((c) => c.regulation === regulation);
  let score = baseExposure * 0.35;
  const factors: string[] = [];

  for (const c of regControls) {
    if (c.status === "missing") {
      score += 12;
      factors.push(`${c.id}:missing`);
    } else if (c.status === "at_risk") {
      score += 18;
      factors.push(`${c.id}:at_risk`);
    }
  }
  for (const f of flags.filter((fl) => fl.regulation === regulation)) {
    score += f.severity === "critical" ? 25 : f.severity === "high" ? 15 : 8;
    factors.push(`flag:${f.id}`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { regulation, score, level: scoreToLevel(score), drivingFactors: factors };
}

/**
 * Compliance intelligence engine — maps classified/discovered data to regulatory
 * obligations, evaluates control gaps, and produces flags and remediation guidance.
 * Informational only; not legal advice.
 */
export function analyzeComplianceIntelligence(input: AnalyzeComplianceInput): ComplianceIntelligenceReport {
  const { discovery, classification, factorContributions = [], hints, controlHints } = input;
  const categories = collectCategories(discovery);
  const labels = collectLabels(classification);
  const applicableRegulations = resolveApplicableRegulations(categories, labels);

  const controlResults: ComplianceControlResult[] = [];
  for (const def of COMPLIANCE_CONTROL_CATALOG) {
    if (!controlApplies(def, applicableRegulations, categories, labels)) continue;
    for (const regulation of def.regulations) {
      if (!applicableRegulations.includes(regulation)) continue;
      const { status, reason } = evaluateControl(def.id, regulation, def.label, {
        categories,
        labels,
        hints,
        controlHints,
        factorContributions,
        discovery
      });
      if (status === "not_applicable") continue;
      controlResults.push({
        id: def.id,
        label: def.label,
        regulation,
        status,
        reason
      });
    }
  }

  const violatedControls = controlResults.filter((c) => c.status === "at_risk");
  const missingControls = controlResults.filter((c) => c.status === "missing");
  const atRiskControls = [...violatedControls];
  const flags = buildFlags(categories, labels, controlResults, hints, factorContributions);

  let baseExposure = 0;
  const drivingLabels: ClassificationLabel[] = [];
  const exposureFactors: string[] = [];

  for (const [label, count] of Object.entries(classification?.summary ?? {}) as [ClassificationLabel, number][]) {
    if ((count ?? 0) <= 0) continue;
    const w = LABEL_EXPOSURE_WEIGHT[label] ?? 10;
    const contribution = Math.min(50, w * Math.log10(Math.max(1, count)) * 4);
    baseExposure += contribution;
    drivingLabels.push(label);
    exposureFactors.push(`label:${label} count=${count}`);
  }

  if (drivingLabels.length === 0 && categories.size > 0) {
    for (const cat of categories) {
      baseExposure += 10;
      exposureFactors.push(`category:${cat}`);
    }
  }

  const sensRecords = discovery.findingsPerRecord.filter((r) => r.findings.length > 0).length;
  const density = sensRecords / Math.max(1, discovery.scannedRecords);
  baseExposure += Math.min(20, density * 25);
  exposureFactors.push(`sensitive_density=${(density * 100).toFixed(1)}%`);

  const publicFactor = factorContributions.find((f) => f.id === "public_exposure");
  if (publicFactor && publicFactor.rawScore >= 40) {
    baseExposure += 15;
    exposureFactors.push("public_exposure_elevates_compliance");
  }
  const encryptionFactor = factorContributions.find((f) => f.id === "missing_encryption");
  if (encryptionFactor && encryptionFactor.rawScore >= 30) {
    baseExposure += 12;
    exposureFactors.push("missing_encryption_elevates_compliance");
  }
  if (hints?.hasReplicationOrBackupFlow) {
    baseExposure += 8;
    exposureFactors.push("replication_increases_breach_scope");
  }

  const exposureScore = Math.max(0, Math.min(100, Math.round(baseExposure)));
  const exposureLevel = scoreToLevel(exposureScore);

  const byRegulation = applicableRegulations.map((r) =>
    regulationExposure(r, controlResults, flags, exposureScore)
  );
  const maxRegScore = byRegulation.length === 0 ? 0 : Math.max(...byRegulation.map((r) => r.score));
  const regulatoryRiskExposure = {
    score: Math.max(exposureScore, maxRegScore),
    level: scoreToLevel(Math.max(exposureScore, maxRegScore)),
    byRegulation
  };

  const status = deriveStatus(applicableRegulations, violatedControls, missingControls, atRiskControls, flags);
  const gapCount = missingControls.length + violatedControls.length;
  const statusScore = Math.max(
    0,
    Math.min(100, Math.round(100 - regulatoryRiskExposure.score * 0.6 - gapCount * 4 - flags.length * 5))
  );

  const remediationSet = new Set<string>();
  for (const c of [...missingControls, ...violatedControls]) {
    const text = REMEDIATION_BY_CONTROL[c.id];
    if (text) remediationSet.add(text);
  }
  for (const f of flags) {
    if (f.regulation === "DPDP" && f.id.includes("aadhaar")) {
      remediationSet.add(
        "Define Aadhaar-specific retention limits and deletion workflows per DPDP; restrict processing to stated lawful purposes."
      );
    }
    if (f.regulation === "HIPAA") {
      remediationSet.add("Remove public/API access to PHI; apply encryption, access controls, and audit logging immediately.");
    }
  }
  if (remediationSet.size === 0 && applicableRegulations.length > 0) {
    remediationSet.add("Maintain current controls; re-scan after schema or exposure changes.");
  }

  return {
    status,
    statusScore,
    applicableRegulations,
    violatedControls,
    missingControls,
    atRiskControls,
    flags,
    remediationActions: [...remediationSet],
    regulatoryRiskExposure,
    exposure: {
      score: exposureScore,
      level: exposureLevel,
      drivingLabels: [...new Set(drivingLabels)].sort(),
      frameworks: applicableRegulations,
      factors: exposureFactors
    }
  };
}
