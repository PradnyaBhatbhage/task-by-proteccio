import type { ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult } from "../discovery";
import type { ProfilingReport } from "../profiling";
import { mappingRegistry, stableDatasetId, stableSystemId } from "../mapping";
import { computeComplianceIntelligence } from "./compliance";
import { comboCriticalFromDiscovery, RISK_FACTOR_COMPUTERS, type FactorContext } from "./factors";
import { detectOverexposedRecords } from "./overexposure";
import type {
  PrivacyRiskAnalysis,
  RiskAssessment,
  RiskExposureHints,
  RiskFactorContribution,
  RiskFactorId,
  RiskLevel,
  RiskScoringWeights
} from "./types";
import { DEFAULT_RISK_WEIGHTS as DEFAULT_WEIGHTS } from "./types";

function normalizeWeights(weights: Partial<RiskScoringWeights>): RiskScoringWeights {
  const factorIds = Object.keys(RISK_FACTOR_COMPUTERS) as RiskFactorId[];
  const merged = { ...DEFAULT_WEIGHTS };
  for (const id of factorIds) {
    const w = weights[id];
    if (w !== undefined && Number.isFinite(w) && w >= 0) {
      merged[id] = w;
    }
  }
  const sum = factorIds.reduce((acc, id) => acc + merged[id], 0);
  if (sum <= 0) return DEFAULT_WEIGHTS;
  const normalized = {} as RiskScoringWeights;
  for (const id of factorIds) {
    normalized[id] = merged[id] / sum;
  }
  return normalized;
}

function mapScoreToLevel(score: number, criticalCombo: boolean): RiskLevel {
  if (criticalCombo || score >= 86) return "critical";
  if (score >= 64) return "high";
  if (score >= 38) return "medium";
  return "low";
}

function factorSummariesFromContributions(contributions: RiskFactorContribution[]): string[] {
  return contributions.flatMap((c) => [
    `${c.id}:raw=${c.rawScore}`,
    ...c.details.map((d) => `${c.id}:${d}`)
  ]);
}

export interface AnalyzePrivacyRiskInput {
  discovery: DiscoveryScanResult;
  classification?: ClassificationScanResult;
  profile?: ProfilingReport;
  hints?: RiskExposureHints;
  weights?: Partial<RiskScoringWeights>;
}

/**
 * Week 3 privacy risk analysis engine — dynamic weighted scoring across seven risk factors,
 * compliance exposure, overexposed record detection, and high-risk dataset classification.
 */
export function analyzePrivacyRisk(input: AnalyzePrivacyRiskInput): PrivacyRiskAnalysis {
  const { discovery, classification, profile, hints, weights: weightOverrides } = input;
  const systemId = stableSystemId(discovery.trace.sourceType, discovery.trace.sourceName);
  const datasetId = stableDatasetId(systemId, discovery.trace.entityName);

  const weights = normalizeWeights(weightOverrides ?? {});
  const ctx: FactorContext = { discovery, classification, profile, hints };

  const factorIds = Object.keys(RISK_FACTOR_COMPUTERS) as RiskFactorId[];
  const factors = factorIds.map((id) => RISK_FACTOR_COMPUTERS[id](ctx, weights[id]));

  let score = Math.round(factors.reduce((acc, f) => acc + f.weightedScore, 0));
  const criticalCombo = comboCriticalFromDiscovery(discovery);
  if (criticalCombo) {
    score = Math.min(100, score + 8);
  }

  score = Math.max(0, Math.min(100, score));
  const level = mapScoreToLevel(score, criticalCombo);
  const complianceIntelligence = computeComplianceIntelligence(discovery, classification, factors, hints);
  const compliance = complianceIntelligence.exposure;
  const overexposedRecords = detectOverexposedRecords(discovery, classification);

  const highRiskReasons: string[] = [];
  if (level === "high" || level === "critical") {
    highRiskReasons.push(`composite_risk_level=${level}`);
  }
  if (criticalCombo) highRiskReasons.push("critical_attribute_combination");
  if (compliance.level === "high" || compliance.level === "critical") {
    highRiskReasons.push(`compliance_exposure=${compliance.level}`);
  }
  if (complianceIntelligence.status === "non_compliant") {
    highRiskReasons.push("compliance_status=non_compliant");
  }
  for (const flag of complianceIntelligence.flags.filter((f) => f.severity === "critical" || f.severity === "high")) {
    highRiskReasons.push(`compliance_flag:${flag.id}`);
  }
  if (overexposedRecords.length > 0) {
    highRiskReasons.push(`overexposed_records=${overexposedRecords.length}`);
  }
  const topFactors = [...factors].sort((a, b) => b.rawScore - a.rawScore).slice(0, 3);
  for (const f of topFactors) {
    if (f.rawScore >= 50) highRiskReasons.push(`factor:${f.id}=${f.rawScore}`);
  }

  const isHighRiskDataset = level === "high" || level === "critical";

  return {
    datasetId,
    systemId,
    level,
    score,
    factors,
    factorSummaries: factorSummariesFromContributions(factors),
    compliance,
    complianceIntelligence,
    overexposedRecords,
    isHighRiskDataset,
    highRiskReasons,
    exposureHintsApplied: hints,
    weightsApplied: weights
  };
}

/**
 * Backward-compatible assessment wrapper used by profiling and catalog flows.
 */
export function assessRisk(
  discovery: DiscoveryScanResult,
  classification: ClassificationScanResult | undefined,
  hints?: RiskExposureHints,
  profile?: ProfilingReport,
  weights?: Partial<RiskScoringWeights>
): RiskAssessment {
  const analysis = analyzePrivacyRisk({ discovery, classification, profile, hints, weights });
  return {
    level: analysis.level,
    score: analysis.score,
    factors: analysis.factorSummaries,
    exposureHintsApplied: analysis.exposureHintsApplied,
    analysis
  };
}

/** Re-export for consumers that import weights from engine. */
export { DEFAULT_RISK_WEIGHTS } from "./types";

/**
 * Enriches exposure hints from mapping registry, catalog state, and duplicate groups.
 */
export function enrichExposureHints(
  discovery: DiscoveryScanResult,
  base?: RiskExposureHints,
  profile?: ProfilingReport
): RiskExposureHints {
  const systemId = stableSystemId(discovery.trace.sourceType, discovery.trace.sourceName);
  const datasetId = stableDatasetId(systemId, discovery.trace.entityName);
  const flows = mappingRegistry.listFlows();
  const downstream = flows.filter((f) => f.fromDatasetId === datasetId);
  const inbound = flows.filter((f) => f.toDatasetId === datasetId);
  const mapped = mappingRegistry.listDatasets().some((d) => d.id === datasetId);
  const duplicateGroups = mappingRegistry.getDuplicateSensitiveGroups();

  const crossDatasetDuplicateGroupCount = duplicateGroups.filter((g) => g.datasetIds.includes(datasetId)).length;

  const lineage: RiskExposureHints = {
    hasApiExposureFlow: downstream.some((f) => f.flowKind === "api_exposure"),
    hasReplicationOrBackupFlow: downstream.some(
      (f) => f.flowKind === "replication" || f.flowKind === "backup"
    ),
    crossDatasetDuplicateGroupCount,
    unmappedDataset: !mapped,
    noLineageFlows: downstream.length === 0 && inbound.length === 0,
    isPubliclyExposed:
      discovery.trace.sourceType === "api" ||
      downstream.some((f) => f.flowKind === "api_exposure")
  };

  if (profile && profile.duplicateSensitivePatterns.groups.length > 0 && !crossDatasetDuplicateGroupCount) {
    lineage.crossDatasetDuplicateGroupCount = profile.duplicateSensitivePatterns.groups.length;
  }

  const mergedDuplicateGroups =
    (lineage.crossDatasetDuplicateGroupCount ?? 0) + (base?.crossDatasetDuplicateGroupCount ?? 0);

  return {
    hasApiExposureFlow: Boolean(lineage.hasApiExposureFlow || base?.hasApiExposureFlow),
    hasReplicationOrBackupFlow: Boolean(lineage.hasReplicationOrBackupFlow || base?.hasReplicationOrBackupFlow),
    isPubliclyExposed: Boolean(lineage.isPubliclyExposed || base?.isPubliclyExposed),
    encryptionIndicated: base?.encryptionIndicated,
    crossDatasetDuplicateGroupCount: mergedDuplicateGroups > 0 ? mergedDuplicateGroups : undefined,
    unmappedDataset: lineage.unmappedDataset && base?.unmappedDataset !== false,
    noLineageFlows: lineage.noLineageFlows && base?.noLineageFlows !== false,
    daysSinceLastActivity: base?.daysSinceLastActivity,
    complianceControls: base?.complianceControls
  };
}
