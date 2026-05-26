import type { GovernanceDatasetSnapshot } from "../catalog/types";
import { governanceCatalog } from "../catalog";
import type { DataFlowKind } from "../mapping/types";
import { mappingRegistry } from "../mapping";
import { remediationStore } from "../remediation/store";
import type { RemediationStatus } from "../remediation/types";
import { identifyHighRiskDatasets } from "../risk/prioritization";
import type { ComplianceRegulation, ComplianceStatus } from "../risk/compliance/types";
import type { HighRiskDatasetFlag, RiskLevel } from "../risk/types";

export interface ClassificationDistribution {
  /** Label totals summed across governance catalog dataset snapshots. */
  catalogLabelTotals: Record<string, number>;
  /** Occurrences of each privacy label on mapped field rows (multi-label fields increment multiple keys). */
  mappedFieldLabelTotals: Record<string, number>;
}

export interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface DiscoveryStatistics {
  /** Sum of per-dataset discovery category totals from the catalog. */
  catalogCategoryTotals: Record<string, number>;
  /** Count of mapped field rows per sensitive discovery category. */
  mappedFieldRowsByCategory: Record<string, number>;
  totalMappedFieldRows: number;
  distinctDatasetsWithMappedFindings: number;
  /** Catalog datasets with at least one non-zero discovery category total. */
  catalogDatasetsWithDetections: number;
}

export interface SourceWiseEntry {
  sourceType: string;
  sourceName: string;
  datasets: number;
  scannedRecords: number;
  sensitiveRecords: number;
  maxRisk: string;
}

export interface ProfilingStatistics {
  datasetsProfiled: number;
  averageDataCompleteness: number | null;
  totalAnomalies: number;
  totalSensitiveFindings: number;
  averageFindingsPerSensitiveRecord: number | null;
}

export interface MappingRelationships {
  systems: number;
  datasets: number;
  mappedFields: number;
  dataFlows: number;
  flowsByKind: Partial<Record<DataFlowKind, number>>;
  duplicateSensitiveGroups: number;
}

export interface CatalogAndInventoryCounts {
  datasetsInCatalog: number;
  systemsInMapping: number;
  datasetsInMapping: number;
  mappedFields: number;
  dataFlows: number;
  duplicateSensitiveGroups: number;
}

export interface HighRiskDatasetsMetrics {
  count: number;
  /** Top high/critical datasets by risk score (safe metadata only). */
  topDatasets: HighRiskDatasetFlag[];
}

export interface ComplianceViolationsMetrics {
  datasetsWithViolations: number;
  datasetsNonCompliant: number;
  datasetsPartiallyCompliant: number;
  totalComplianceFlags: number;
  totalViolatedControls: number;
  totalMissingControls: number;
  totalAtRiskControls: number;
  byStatus: Partial<Record<ComplianceStatus, number>>;
  byRegulation: Partial<Record<ComplianceRegulation, number>>;
}

/** Source × risk-level matrix for heatmap visualizations. */
export interface SourceRiskHeatmap {
  sources: Array<{
    key: string;
    sourceType: string;
    sourceName: string;
    totals: RiskDistribution;
    aggregateRiskScore: number;
    maxRiskLevel: RiskLevel;
  }>;
  riskLevels: RiskLevel[];
}

export interface RemediationStatusMetrics {
  totalTickets: number;
  byStatus: Partial<Record<RemediationStatus, number>>;
  bySeverity: Partial<Record<RiskLevel, number>>;
  openVsResolved: {
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    /** open + in_progress */
    active: number;
    /** resolved + closed */
    completed: number;
  };
}

export interface ExposedSystemEntry {
  systemId: string;
  sourceType: string;
  sourceName: string;
  exposureScore: number;
  datasetCount: number;
  sensitiveRecordCount: number;
  apiExposureFlowCount: number;
  overexposedRecordCount: number;
  maxRiskLevel: RiskLevel;
  reasons: string[];
}

/** Full dashboard analytics payload (safe aggregates only). */
export interface DashboardAnalytics {
  generatedAt: string;
  /** Unique scanned source instances (`sourceType::sourceName`) in the governance catalog. */
  totalScannedSources: number;
  totalScannedRecords: number;
  totalSensitiveRecords: number;
  highRiskDatasets: HighRiskDatasetsMetrics;
  complianceViolations: ComplianceViolationsMetrics;
  classificationDistribution: ClassificationDistribution;
  riskDistribution: RiskDistribution;
  sourceRiskHeatmap: SourceRiskHeatmap;
  discoveryStatistics: DiscoveryStatistics;
  /** Keyed by `sourceType::sourceName`. */
  sourceWiseBreakdown: Record<string, SourceWiseEntry>;
  profilingStatistics: ProfilingStatistics;
  mappingRelationships: MappingRelationships;
  remediationStatus: RemediationStatusMetrics;
  mostExposedSystems: ExposedSystemEntry[];
  highRiskSourceCount: number;
  catalogAndInventoryCounts: CatalogAndInventoryCounts;
}

function sumRiskLevels(rows: GovernanceDatasetSnapshot[]): RiskDistribution {
  const out: RiskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of rows) {
    out[r.riskLevel] += 1;
  }
  return out;
}

function sumDiscoveryCatalog(rows: GovernanceDatasetSnapshot[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.discoveryCategoryTotals)) {
      totals[k] = (totals[k] ?? 0) + (v ?? 0);
    }
  }
  return totals;
}

function sumClassificationCatalog(rows: GovernanceDatasetSnapshot[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.classificationTotals)) {
      totals[k] = (totals[k] ?? 0) + (v ?? 0);
    }
  }
  return totals;
}

function flowsByKind(flows: { flowKind: DataFlowKind }[]): Partial<Record<DataFlowKind, number>> {
  const out: Partial<Record<DataFlowKind, number>> = {};
  for (const f of flows) {
    out[f.flowKind] = (out[f.flowKind] ?? 0) + 1;
  }
  return out;
}

const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"];
const LEVEL_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

function buildComplianceViolations(rows: GovernanceDatasetSnapshot[]): ComplianceViolationsMetrics {
  const byStatus: Partial<Record<ComplianceStatus, number>> = {};
  const byRegulation: Partial<Record<ComplianceRegulation, number>> = {};
  let datasetsNonCompliant = 0;
  let datasetsPartiallyCompliant = 0;
  let totalComplianceFlags = 0;
  let totalViolatedControls = 0;
  let totalMissingControls = 0;
  let totalAtRiskControls = 0;

  for (const r of rows) {
    const intel = r.risk.analysis?.complianceIntelligence;
    if (!intel) continue;

    byStatus[intel.status] = (byStatus[intel.status] ?? 0) + 1;
    if (intel.status === "non_compliant") datasetsNonCompliant += 1;
    if (intel.status === "partial") datasetsPartiallyCompliant += 1;

    totalComplianceFlags += intel.flags.length;
    totalViolatedControls += intel.violatedControls.length;
    totalMissingControls += intel.missingControls.length;
    totalAtRiskControls += intel.atRiskControls.length;

    for (const flag of intel.flags) {
      byRegulation[flag.regulation] = (byRegulation[flag.regulation] ?? 0) + 1;
    }
    for (const ctrl of intel.violatedControls) {
      byRegulation[ctrl.regulation] = (byRegulation[ctrl.regulation] ?? 0) + 1;
    }
  }

  return {
    datasetsWithViolations: datasetsNonCompliant + datasetsPartiallyCompliant,
    datasetsNonCompliant,
    datasetsPartiallyCompliant,
    totalComplianceFlags,
    totalViolatedControls,
    totalMissingControls,
    totalAtRiskControls,
    byStatus,
    byRegulation
  };
}

function buildSourceRiskHeatmap(rows: GovernanceDatasetSnapshot[]): SourceRiskHeatmap {
  const groups = new Map<string, GovernanceDatasetSnapshot[]>();

  for (const r of rows) {
    const key = `${r.trace.sourceType}::${r.trace.sourceName}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const sources = [...groups.entries()].map(([key, groupRows]) => {
    const totals: RiskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
    let maxRisk: RiskLevel = "low";
    let scoreSum = 0;

    for (const r of groupRows) {
      totals[r.riskLevel] += 1;
      maxRisk = maxLevel(maxRisk, r.riskLevel);
      scoreSum += r.risk.score;
    }

    const [sourceType, sourceName] = key.split("::") as [string, string];
    return {
      key,
      sourceType,
      sourceName,
      totals,
      aggregateRiskScore: Math.round(scoreSum / Math.max(1, groupRows.length)),
      maxRiskLevel: maxRisk
    };
  });

  sources.sort((a, b) => b.aggregateRiskScore - a.aggregateRiskScore);
  return { sources, riskLevels: RISK_LEVELS };
}

function buildRemediationStatus(): RemediationStatusMetrics {
  const tickets = remediationStore.list();
  const byStatus: Partial<Record<RemediationStatus, number>> = {};
  const bySeverity: Partial<Record<RiskLevel, number>> = {};

  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    bySeverity[t.severity] = (bySeverity[t.severity] ?? 0) + 1;
  }

  const open = byStatus.open ?? 0;
  const inProgress = byStatus.in_progress ?? 0;
  const resolved = byStatus.resolved ?? 0;
  const closed = byStatus.closed ?? 0;

  return {
    totalTickets: tickets.length,
    byStatus,
    bySeverity,
    openVsResolved: {
      open,
      inProgress,
      resolved,
      closed,
      active: open + inProgress,
      completed: resolved + closed
    }
  };
}

function buildMostExposedSystems(rows: GovernanceDatasetSnapshot[], limit = 15): ExposedSystemEntry[] {
  const inventory = mappingRegistry.exportInventory();
  const apiFlowsByDataset = new Map<string, number>();

  for (const flow of inventory.flows) {
    if (flow.flowKind !== "api_exposure") continue;
    apiFlowsByDataset.set(flow.fromDatasetId, (apiFlowsByDataset.get(flow.fromDatasetId) ?? 0) + 1);
    apiFlowsByDataset.set(flow.toDatasetId, (apiFlowsByDataset.get(flow.toDatasetId) ?? 0) + 1);
  }

  const groups = new Map<string, GovernanceDatasetSnapshot[]>();
  for (const r of rows) {
    const list = groups.get(r.systemId) ?? [];
    list.push(r);
    groups.set(r.systemId, list);
  }

  const scored: ExposedSystemEntry[] = [...groups.entries()].map(([systemId, groupRows]) => {
    const sample = groupRows[0]!;
    let exposureScore = 0;
    const reasons = new Set<string>();
    let apiExposureFlowCount = 0;
    let overexposedRecordCount = 0;
    let maxRisk: RiskLevel = "low";

    for (const r of groupRows) {
      maxRisk = maxLevel(maxRisk, r.riskLevel);
      const hints = r.risk.analysis?.exposureHintsApplied ?? r.risk.exposureHintsApplied;
      if (hints?.isPubliclyExposed) {
        exposureScore += 25;
        reasons.add("publicly_exposed");
      }
      if (hints?.hasApiExposureFlow) {
        exposureScore += 20;
        reasons.add("api_exposure_flow");
      }
      if (hints?.encryptionIndicated === false) {
        exposureScore += 12;
        reasons.add("missing_encryption_indicators");
      }
      const over = r.risk.analysis?.overexposedRecords.length ?? 0;
      overexposedRecordCount += over;
      if (over > 0) reasons.add("overexposed_sensitive_records");

      apiExposureFlowCount += apiFlowsByDataset.get(r.datasetId) ?? 0;

      const complianceExposure = r.risk.analysis?.complianceIntelligence?.regulatoryRiskExposure.score ?? 0;
      if (complianceExposure >= 60) {
        exposureScore += 10;
        reasons.add("elevated_regulatory_exposure");
      }
    }

    exposureScore += Math.min(30, apiExposureFlowCount * 5);
    exposureScore += Math.min(40, overexposedRecordCount * 2);
    exposureScore += LEVEL_RANK[maxRisk] * 8;

    return {
      systemId,
      sourceType: sample.trace.sourceType,
      sourceName: sample.trace.sourceName,
      exposureScore: Math.round(exposureScore),
      datasetCount: groupRows.length,
      sensitiveRecordCount: groupRows.reduce((a, r) => a + r.sensitiveRecordCount, 0),
      apiExposureFlowCount,
      overexposedRecordCount,
      maxRiskLevel: maxRisk,
      reasons: [...reasons]
    };
  });

  return scored.sort((a, b) => b.exposureScore - a.exposureScore).slice(0, limit);
}

/**
 * Computes governance dashboard aggregates from the in-memory catalog and mapping registry.
 * Callers should invoke `governanceCatalog.refreshMappedFlags()` first if mapping membership must be current.
 */
export function buildDashboardAnalytics(): DashboardAnalytics {
  const catalogRows = governanceCatalog.list();
  const inventory = mappingRegistry.exportInventory();

  const totalScannedRecords = catalogRows.reduce((acc, r) => acc + r.totalRecords, 0);
  const totalSensitiveRecords = catalogRows.reduce((acc, r) => acc + r.sensitiveRecordCount, 0);

  const mappedFieldLabelTotals: Record<string, number> = {};
  for (const f of inventory.fields) {
    const labels = f.privacyLabels;
    if (labels && labels.length > 0) {
      for (const lab of labels) {
        mappedFieldLabelTotals[lab] = (mappedFieldLabelTotals[lab] ?? 0) + 1;
      }
    }
  }

  const mappedFieldRowsByCategory: Record<string, number> = {};
  for (const f of inventory.fields) {
    mappedFieldRowsByCategory[f.sensitiveCategory] = (mappedFieldRowsByCategory[f.sensitiveCategory] ?? 0) + 1;
  }

  const catalogCategoryTotals = sumDiscoveryCatalog(catalogRows);
  const catalogDatasetsWithDetections = catalogRows.filter((r) =>
    Object.values(r.discoveryCategoryTotals).some((n) => (n ?? 0) > 0)
  ).length;

  const profilingStatistics: ProfilingStatistics = {
    datasetsProfiled: catalogRows.length,
    averageDataCompleteness:
      catalogRows.length === 0
        ? null
        : catalogRows.reduce((acc, r) => acc + (r.profile.dataCompleteness?.score ?? 0), 0) / catalogRows.length,
    totalAnomalies: catalogRows.reduce((acc, r) => acc + r.profile.anomalies.length, 0),
    totalSensitiveFindings: catalogRows.reduce((acc, r) => acc + r.profile.sensitiveDensity.sensitiveFindings, 0),
    averageFindingsPerSensitiveRecord:
      catalogRows.length === 0
        ? null
        : catalogRows.reduce((acc, r) => acc + r.profile.sensitiveDensity.findingsPerSensitiveRecord, 0) /
          catalogRows.length
  };

  const highRiskSourceCount = new Set(
    catalogRows.filter((r) => r.riskLevel === "high" || r.riskLevel === "critical").map((r) => r.trace.sourceName)
  ).size;

  const sourceWiseBreakdown = catalogRows.reduce<Record<string, SourceWiseEntry>>((acc, r) => {
    const key = `${r.trace.sourceType}::${r.trace.sourceName}`;
    const cur =
      acc[key] ??
      ({
        sourceType: r.trace.sourceType,
        sourceName: r.trace.sourceName,
        datasets: 0,
        scannedRecords: 0,
        sensitiveRecords: 0,
        maxRisk: "low"
      } satisfies SourceWiseEntry);
    cur.datasets += 1;
    cur.scannedRecords += r.totalRecords;
    cur.sensitiveRecords += r.sensitiveRecordCount;
    const rank = { low: 0, medium: 1, high: 2, critical: 3 };
    if (rank[r.riskLevel as keyof typeof rank] > rank[cur.maxRisk as keyof typeof rank]) {
      cur.maxRisk = r.riskLevel;
    }
    acc[key] = cur;
    return acc;
  }, {});

  const highRiskCount = catalogRows.filter((r) => r.riskLevel === "high" || r.riskLevel === "critical").length;
  const highRiskList = identifyHighRiskDatasets(catalogRows, { minLevel: "high", limit: 25 });

  return {
    generatedAt: new Date().toISOString(),
    totalScannedSources: Object.keys(sourceWiseBreakdown).length,
    totalScannedRecords,
    totalSensitiveRecords,
    highRiskDatasets: {
      count: highRiskCount,
      topDatasets: highRiskList
    },
    complianceViolations: buildComplianceViolations(catalogRows),
    sourceRiskHeatmap: buildSourceRiskHeatmap(catalogRows),
    remediationStatus: buildRemediationStatus(),
    mostExposedSystems: buildMostExposedSystems(catalogRows),
    classificationDistribution: {
      catalogLabelTotals: sumClassificationCatalog(catalogRows),
      mappedFieldLabelTotals
    },
    riskDistribution: sumRiskLevels(catalogRows),
    discoveryStatistics: {
      catalogCategoryTotals,
      mappedFieldRowsByCategory,
      totalMappedFieldRows: inventory.fields.length,
      distinctDatasetsWithMappedFindings: new Set(inventory.fields.map((f) => f.datasetId)).size,
      catalogDatasetsWithDetections
    },
    sourceWiseBreakdown,
    profilingStatistics,
    mappingRelationships: {
      systems: inventory.systems.length,
      datasets: inventory.datasets.length,
      mappedFields: inventory.fields.length,
      dataFlows: inventory.flows.length,
      flowsByKind: flowsByKind(inventory.flows),
      duplicateSensitiveGroups: inventory.duplicateGroups.length
    },
    highRiskSourceCount,
    catalogAndInventoryCounts: {
      datasetsInCatalog: catalogRows.length,
      systemsInMapping: inventory.systems.length,
      datasetsInMapping: inventory.datasets.length,
      mappedFields: inventory.fields.length,
      dataFlows: inventory.flows.length,
      duplicateSensitiveGroups: inventory.duplicateGroups.length
    }
  };
}
