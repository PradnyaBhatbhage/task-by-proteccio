import type { GovernanceDatasetSnapshot } from "../catalog/types";
import type { RiskLevel } from "./types";

const LEVEL_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

function topFactorStrings(snapshots: GovernanceDatasetSnapshot[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const s of snapshots) {
    for (const f of s.risk.factors) {
      const key = f.split("=")[0] ?? f;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, n]) => `${k} (${n})`);
}

/**
 * Aggregates privacy risk across all datasets sharing the same source instance.
 */
export function aggregateRiskBySource(snapshots: GovernanceDatasetSnapshot[]) {
  const groups = new Map<string, GovernanceDatasetSnapshot[]>();

  for (const s of snapshots) {
    const key = `${s.trace.sourceType}::${s.trace.sourceName}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([key, rows]) => {
    const [sourceType, sourceName] = key.split("::") as [GovernanceDatasetSnapshot["trace"]["sourceType"], string];
    const dist: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    let maxRisk: RiskLevel = "low";
    let scoreSum = 0;
    let complianceSum = 0;

    for (const r of rows) {
      dist[r.riskLevel] += 1;
      maxRisk = maxLevel(maxRisk, r.riskLevel);
      scoreSum += r.risk.score;
      complianceSum += r.risk.analysis?.compliance.score ?? r.risk.score * 0.85;
    }

    return {
      sourceType,
      sourceName,
      systemIds: [...new Set(rows.map((r) => r.systemId))],
      datasetCount: rows.length,
      totalRecords: rows.reduce((a, r) => a + r.totalRecords, 0),
      sensitiveRecordCount: rows.reduce((a, r) => a + r.sensitiveRecordCount, 0),
      aggregateRiskScore: Math.round(scoreSum / Math.max(1, rows.length)),
      maxRiskLevel: maxRisk,
      riskLevelDistribution: dist,
      complianceExposureScore: Math.round(complianceSum / Math.max(1, rows.length)),
      topFactors: topFactorStrings(rows)
    };
  });
}

/**
 * Aggregates privacy risk per logical system (source type + source name).
 */
export function aggregateRiskBySystem(snapshots: GovernanceDatasetSnapshot[]) {
  const groups = new Map<string, GovernanceDatasetSnapshot[]>();

  for (const s of snapshots) {
    const list = groups.get(s.systemId) ?? [];
    list.push(s);
    groups.set(s.systemId, list);
  }

  return [...groups.entries()].map(([systemId, rows]) => {
    let maxRisk: RiskLevel = "low";
    let scoreSum = 0;
    let complianceSum = 0;

    for (const r of rows) {
      maxRisk = maxLevel(maxRisk, r.riskLevel);
      scoreSum += r.risk.score;
      complianceSum += r.risk.analysis?.compliance.score ?? r.risk.score * 0.85;
    }

    return {
      systemId,
      sourceType: rows[0]!.trace.sourceType,
      sourceName: rows[0]!.trace.sourceName,
      datasetCount: rows.length,
      totalRecords: rows.reduce((a, r) => a + r.totalRecords, 0),
      sensitiveRecordCount: rows.reduce((a, r) => a + r.sensitiveRecordCount, 0),
      aggregateRiskScore: Math.round(scoreSum / Math.max(1, rows.length)),
      maxRiskLevel: maxRisk,
      complianceExposureScore: Math.round(complianceSum / Math.max(1, rows.length))
    };
  });
}
