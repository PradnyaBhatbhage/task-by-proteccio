import type { GovernanceDatasetSnapshot } from "../catalog/types";
import type { HighRiskDatasetFlag, RiskPrioritizationItem } from "./types";

const LEVEL_BOOST: Record<string, number> = {
  low: 0,
  medium: 8,
  high: 22,
  critical: 40
};

function actionHintsFor(snap: GovernanceDatasetSnapshot): string[] {
  const hints: string[] = [];
  const analysis = snap.risk.analysis;

  if (snap.riskLevel === "critical" || snap.riskLevel === "high") {
    hints.push("prioritize_remediation_review");
  }
  if (analysis?.overexposedRecords.length) {
    hints.push("review_overexposed_records");
  }
  if (!snap.mapped) {
    hints.push("register_in_data_mapping");
  }
  if (analysis?.factors.some((f) => f.id === "missing_encryption" && f.rawScore >= 30)) {
    hints.push("verify_encryption_controls");
  }
  if (analysis?.factors.some((f) => f.id === "public_exposure" && f.rawScore >= 35)) {
    hints.push("restrict_public_access_paths");
  }
  if (analysis?.factors.some((f) => f.id === "duplicate_storage" && f.rawScore >= 25)) {
    hints.push("deduplicate_sensitive_copies");
  }
  return hints;
}

/**
 * Builds a ranked remediation queue from governance catalog snapshots.
 */
export function buildRiskPrioritization(
  snapshots: GovernanceDatasetSnapshot[],
  options?: { limit?: number; minLevel?: "medium" | "high" | "critical" }
): RiskPrioritizationItem[] {
  const limit = options?.limit ?? 50;
  const minRank = options?.minLevel === "critical" ? 3 : options?.minLevel === "high" ? 2 : options?.minLevel === "medium" ? 1 : 0;

  const items = snapshots
    .map((snap) => {
      const complianceScore = snap.risk.analysis?.compliance.score ?? Math.round(snap.risk.score * 0.85);
      const overexposed = snap.risk.analysis?.overexposedRecords.length ?? 0;
      const priorityScore =
        snap.risk.score +
        (LEVEL_BOOST[snap.riskLevel] ?? 0) +
        complianceScore * 0.25 +
        Math.min(15, overexposed * 2) +
        (snap.sensitiveRecordCount > 0 && !snap.mapped ? 10 : 0);

      return {
        rank: 0,
        datasetId: snap.datasetId,
        systemId: snap.systemId,
        sourceType: snap.trace.sourceType,
        sourceName: snap.trace.sourceName,
        entityName: snap.trace.entityName,
        riskLevel: snap.riskLevel,
        riskScore: snap.risk.score,
        complianceScore,
        priorityScore: Math.round(priorityScore * 10) / 10,
        actionHints: actionHintsFor(snap)
      };
    })
    .filter((item) => {
      const rank = { low: 0, medium: 1, high: 2, critical: 3 }[item.riskLevel];
      return rank >= minRank;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
    .map((item, i) => ({ ...item, rank: i + 1 }));

  return items;
}

export function identifyHighRiskDatasets(
  snapshots: GovernanceDatasetSnapshot[],
  options?: { minLevel?: "high" | "critical"; limit?: number }
): HighRiskDatasetFlag[] {
  const minLevel = options?.minLevel ?? "high";
  const limit = options?.limit ?? 100;
  const minRank = minLevel === "critical" ? 3 : 2;

  return snapshots
    .filter((s) => {
      const rank = { low: 0, medium: 1, high: 2, critical: 3 }[s.riskLevel];
      return rank >= minRank;
    })
    .sort((a, b) => b.risk.score - a.risk.score)
    .slice(0, limit)
    .map((s) => ({
      datasetId: s.datasetId,
      systemId: s.systemId,
      sourceType: s.trace.sourceType,
      sourceName: s.trace.sourceName,
      entityName: s.trace.entityName,
      riskLevel: s.riskLevel,
      riskScore: s.risk.score,
      complianceScore: s.risk.analysis?.compliance.score ?? Math.round(s.risk.score * 0.85),
      primaryReasons: s.risk.analysis?.highRiskReasons ?? s.risk.factors.slice(0, 5)
    }));
}
