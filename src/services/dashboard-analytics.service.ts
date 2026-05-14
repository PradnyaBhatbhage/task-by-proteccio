import type { GovernanceDatasetSnapshot } from "../catalog/types";
import { governanceCatalog } from "../catalog";
import type { DataFlowKind } from "../mapping/types";
import { mappingRegistry } from "../mapping";

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

/** Full dashboard analytics payload (safe aggregates only). */
export interface DashboardAnalytics {
  generatedAt: string;
  totalScannedRecords: number;
  totalSensitiveRecords: number;
  classificationDistribution: ClassificationDistribution;
  riskDistribution: RiskDistribution;
  discoveryStatistics: DiscoveryStatistics;
  /** Keyed by `sourceType::sourceName`. */
  sourceWiseBreakdown: Record<string, SourceWiseEntry>;
  profilingStatistics: ProfilingStatistics;
  mappingRelationships: MappingRelationships;
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

  return {
    generatedAt: new Date().toISOString(),
    totalScannedRecords,
    totalSensitiveRecords,
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
