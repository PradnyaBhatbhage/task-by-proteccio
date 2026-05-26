import type { GovernanceDatasetSnapshot } from "../catalog/types";
import type { ClassificationLabel } from "../classification/types";
import type { SensitiveCategory } from "../discovery";
import { remediationStore } from "../remediation";
import type { ComplianceRegulation, ComplianceStatus } from "../risk/compliance/types";
import type { RiskLevel } from "../risk/types";
import type {
  ClassificationMatchMode,
  DatasetSearchQuery,
  DetectionMatchMode
} from "./types";

function complianceIntel(snap: GovernanceDatasetSnapshot) {
  return snap.risk.analysis?.complianceIntelligence;
}

export function matchesComplianceRegulation(
  snap: GovernanceDatasetSnapshot,
  regulation: ComplianceRegulation,
  violationOnly: boolean
): boolean {
  const ci = complianceIntel(snap);
  if (!ci) return false;
  if (!ci.applicableRegulations.includes(regulation)) return false;
  if (!violationOnly) return true;

  const hasViolation =
    ci.violatedControls.some((c) => c.regulation === regulation) ||
    ci.flags.some((f) => f.regulation === regulation) ||
    ci.missingControls.some((c) => c.regulation === regulation && c.status === "missing");

  return hasViolation || (ci.status === "non_compliant" && ci.applicableRegulations.includes(regulation));
}

export function matchesComplianceStatus(snap: GovernanceDatasetSnapshot, status: ComplianceStatus): boolean {
  const ci = complianceIntel(snap);
  return ci?.status === status;
}

export function matchesKeyword(snap: GovernanceDatasetSnapshot, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  const parts: string[] = [
    snap.datasetId,
    snap.systemId,
    snap.trace.sourceName,
    snap.trace.entityName,
    snap.trace.sourceType,
    snap.riskLevel,
    ...snap.risk.factors
  ];
  const ci = complianceIntel(snap);
  if (ci) {
    for (const f of ci.flags) {
      parts.push(f.title, f.description, f.regulation);
    }
    for (const c of [...ci.violatedControls, ...ci.missingControls, ...ci.atRiskControls]) {
      parts.push(c.label, c.reason, c.regulation);
    }
    parts.push(ci.status, ...ci.applicableRegulations, ...ci.remediationActions);
  }
  return parts.some((p) => p.toLowerCase().includes(needle));
}

function matchLabels(
  totals: Partial<Record<ClassificationLabel, number>>,
  labels: ClassificationLabel[],
  mode: ClassificationMatchMode
): boolean {
  if (labels.length === 0) return true;
  const hits = labels.map((l) => (totals[l] ?? 0) > 0);
  return mode === "and" ? hits.every(Boolean) : hits.some(Boolean);
}

function matchCategories(
  totals: Partial<Record<SensitiveCategory, number>>,
  categories: SensitiveCategory[],
  mode: DetectionMatchMode
): boolean {
  if (categories.length === 0) return true;
  const hits = categories.map((c) => (totals[c] ?? 0) > 0);
  return mode === "and" ? hits.every(Boolean) : hits.some(Boolean);
}

export function filterDatasets(rows: GovernanceDatasetSnapshot[], q: DatasetSearchQuery): GovernanceDatasetSnapshot[] {
  let out = rows;

  const riskLevels = q.riskLevels?.length ? q.riskLevels : q.riskLevel ? [q.riskLevel] : undefined;
  if (riskLevels?.length) {
    out = out.filter((r) => riskLevels.includes(r.riskLevel));
  }
  if (q.minRiskScore !== undefined) {
    out = out.filter((r) => r.risk.score >= q.minRiskScore!);
  }
  if (q.maxRiskScore !== undefined) {
    out = out.filter((r) => r.risk.score <= q.maxRiskScore!);
  }
  if (q.systemId) {
    out = out.filter((r) => r.systemId === q.systemId);
  }
  if (q.datasetId) {
    out = out.filter((r) => r.datasetId === q.datasetId);
  }
  if (q.sourceType) {
    out = out.filter((r) => r.trace.sourceType === q.sourceType);
  }
  if (q.sourceNameContains) {
    const needle = q.sourceNameContains.toLowerCase();
    out = out.filter(
      (r) =>
        r.trace.sourceName.toLowerCase().includes(needle) || r.trace.entityName.toLowerCase().includes(needle)
    );
  }

  const classLabels = q.classificationLabels?.length
    ? q.classificationLabels
    : q.classificationLabel
      ? [q.classificationLabel]
      : [];
  if (classLabels.length) {
    const mode = q.classificationMode ?? (classLabels.length > 1 ? "and" : "or");
    out = out.filter((r) => matchLabels(r.classificationTotals, classLabels, mode));
  }

  const detCategories = q.detectionCategories?.length
    ? q.detectionCategories
    : q.detectionCategory
      ? [q.detectionCategory]
      : [];
  if (detCategories.length) {
    const mode = q.detectionMode ?? (detCategories.length > 1 ? "and" : "or");
    out = out.filter((r) => matchCategories(r.discoveryCategoryTotals, detCategories, mode));
  }

  if (q.mappedOnly) {
    out = out.filter((r) => r.mapped);
  }
  if (q.complianceRegulation) {
    out = out.filter((r) =>
      matchesComplianceRegulation(r, q.complianceRegulation!, Boolean(q.complianceViolation))
    );
  }
  if (q.complianceStatus) {
    out = out.filter((r) => matchesComplianceStatus(r, q.complianceStatus!));
  }
  if (q.hasUnresolvedRemediation) {
    const unresolvedIds = new Set(
      remediationStore
        .list()
        .filter((t) => t.status === "open" || t.status === "in_progress")
        .map((t) => t.datasetId)
        .filter((id): id is string => Boolean(id))
    );
    out = out.filter((r) => unresolvedIds.has(r.datasetId));
  }
  if (q.keyword) {
    out = out.filter((r) => matchesKeyword(r, q.keyword!));
  }

  return out;
}

const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

export function sortDatasets(
  rows: GovernanceDatasetSnapshot[],
  sortBy: DatasetSearchQuery["sortBy"] = "updatedAt",
  sortOrder: DatasetSearchQuery["sortOrder"] = "desc"
): GovernanceDatasetSnapshot[] {
  const dir = sortOrder === "asc" ? 1 : -1;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "riskScore":
        cmp = a.risk.score - b.risk.score;
        break;
      case "riskLevel":
        cmp = RISK_LEVEL_ORDER[a.riskLevel] - RISK_LEVEL_ORDER[b.riskLevel];
        break;
      case "sourceName":
        cmp = a.trace.sourceName.localeCompare(b.trace.sourceName);
        break;
      case "complianceScore": {
        const sa = a.risk.analysis?.complianceIntelligence.statusScore ?? a.risk.score;
        const sb = b.risk.analysis?.complianceIntelligence.statusScore ?? b.risk.score;
        cmp = sa - sb;
        break;
      }
      case "updatedAt":
      default:
        cmp = a.updatedAt.localeCompare(b.updatedAt);
        break;
    }
    if (cmp === 0) cmp = a.datasetId.localeCompare(b.datasetId);
    return cmp * dir;
  });
  return sorted;
}

export function datasetCursorPayload(
  snap: GovernanceDatasetSnapshot,
  sortBy: DatasetSearchQuery["sortBy"] = "updatedAt"
): { sortBy: NonNullable<DatasetSearchQuery["sortBy"]>; sortOrder: "asc" | "desc"; sortValue: string | number; id: string } {
  let sortValue: string | number = snap.updatedAt;
  switch (sortBy) {
    case "riskScore":
      sortValue = snap.risk.score;
      break;
    case "riskLevel":
      sortValue = snap.riskLevel;
      break;
    case "sourceName":
      sortValue = snap.trace.sourceName;
      break;
    case "complianceScore":
      sortValue = snap.risk.analysis?.complianceIntelligence.statusScore ?? snap.risk.score;
      break;
    default:
      sortValue = snap.updatedAt;
  }
  return { sortBy, sortOrder: "desc", sortValue, id: snap.datasetId };
}
