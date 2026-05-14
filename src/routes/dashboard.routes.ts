import { Router } from "express";
import { auditTrail } from "../audit";
import { governanceCatalog } from "../catalog";
import {
  buildDashboardAnalytics,
  type DashboardAnalytics
} from "../services/dashboard-analytics.service";

const router = Router();

function auditDashboard(source: string, started: number, meta: Record<string, unknown>) {
  auditTrail.append({
    source,
    action: "dashboard_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: meta
  });
}

function refreshAndBuild(): DashboardAnalytics {
  governanceCatalog.refreshMappedFlags();
  return buildDashboardAnalytics();
}

/**
 * GET /api/dashboard/analytics
 * Canonical dashboard payload: scanned/sensitive totals, distributions, profiling, mapping, sources, high-risk count.
 */
router.get("/dashboard/analytics", (_req, res) => {
  const started = Date.now();
  const analytics = refreshAndBuild();
  auditDashboard("api:dashboard/analytics", started, {
    datasetsInCatalog: analytics.catalogAndInventoryCounts.datasetsInCatalog,
    mappedFields: analytics.catalogAndInventoryCounts.mappedFields
  });
  return res.json(analytics);
});

/** GET /api/dashboard/metrics/records */
router.get("/dashboard/metrics/records", (_req, res) => {
  const started = Date.now();
  const a = refreshAndBuild();
  auditDashboard("api:dashboard/metrics/records", started, {});
  return res.json({
    generatedAt: a.generatedAt,
    totalScannedRecords: a.totalScannedRecords,
    totalSensitiveRecords: a.totalSensitiveRecords
  });
});

/** GET /api/dashboard/metrics/classification */
router.get("/dashboard/metrics/classification", (_req, res) => {
  const started = Date.now();
  const a = refreshAndBuild();
  auditDashboard("api:dashboard/metrics/classification", started, {});
  return res.json({
    generatedAt: a.generatedAt,
    classificationDistribution: a.classificationDistribution
  });
});

/** GET /api/dashboard/metrics/risk */
router.get("/dashboard/metrics/risk", (_req, res) => {
  const started = Date.now();
  const a = refreshAndBuild();
  auditDashboard("api:dashboard/metrics/risk", started, {});
  return res.json({
    generatedAt: a.generatedAt,
    riskDistribution: a.riskDistribution
  });
});

/** GET /api/dashboard/metrics/discovery */
router.get("/dashboard/metrics/discovery", (_req, res) => {
  const started = Date.now();
  const a = refreshAndBuild();
  auditDashboard("api:dashboard/metrics/discovery", started, {});
  return res.json({
    generatedAt: a.generatedAt,
    discoveryStatistics: a.discoveryStatistics
  });
});

/** GET /api/dashboard/metrics/sources */
router.get("/dashboard/metrics/sources", (_req, res) => {
  const started = Date.now();
  const a = refreshAndBuild();
  auditDashboard("api:dashboard/metrics/sources", started, {});
  return res.json({
    generatedAt: a.generatedAt,
    sourceWiseBreakdown: a.sourceWiseBreakdown
  });
});

/** GET /api/dashboard/metrics/profiling */
router.get("/dashboard/metrics/profiling", (_req, res) => {
  const started = Date.now();
  const a = refreshAndBuild();
  auditDashboard("api:dashboard/metrics/profiling", started, {});
  return res.json({
    generatedAt: a.generatedAt,
    profilingStatistics: a.profilingStatistics
  });
});

/** GET /api/dashboard/metrics/mapping */
router.get("/dashboard/metrics/mapping", (_req, res) => {
  const started = Date.now();
  const a = refreshAndBuild();
  auditDashboard("api:dashboard/metrics/mapping", started, {});
  return res.json({
    generatedAt: a.generatedAt,
    mappingRelationships: a.mappingRelationships
  });
});

/** GET /api/dashboard/metrics/high-risk-sources */
router.get("/dashboard/metrics/high-risk-sources", (_req, res) => {
  const started = Date.now();
  const a = refreshAndBuild();
  auditDashboard("api:dashboard/metrics/high-risk-sources", started, {});
  return res.json({
    generatedAt: a.generatedAt,
    highRiskSourceCount: a.highRiskSourceCount
  });
});

/**
 * GET /api/dashboard/summary
 * Legacy aggregate shape for existing clients (same underlying analytics as `/dashboard/analytics`).
 */
router.get("/dashboard/summary", (_req, res) => {
  const started = Date.now();
  const a = refreshAndBuild();

  const sourceBreakdown = Object.fromEntries(
    Object.entries(a.sourceWiseBreakdown).map(([key, v]) => [
      key,
      {
        datasets: v.datasets,
        scannedRecords: v.scannedRecords,
        sensitiveRecords: v.sensitiveRecords,
        maxRisk: v.maxRisk
      }
    ])
  );

  const payload = {
    generatedAt: a.generatedAt,
    totals: {
      totalScannedRecords: a.totalScannedRecords,
      totalSensitiveRecords: a.totalSensitiveRecords,
      datasetsInCatalog: a.catalogAndInventoryCounts.datasetsInCatalog,
      systemsInMapping: a.catalogAndInventoryCounts.systemsInMapping,
      datasetsInMapping: a.catalogAndInventoryCounts.datasetsInMapping,
      mappedFields: a.catalogAndInventoryCounts.mappedFields,
      dataFlows: a.catalogAndInventoryCounts.dataFlows,
      duplicateSensitiveGroups: a.catalogAndInventoryCounts.duplicateSensitiveGroups,
      highRiskSourceCount: a.highRiskSourceCount
    },
    riskDistributionCatalog: a.riskDistribution,
    classificationDistributionCatalog: a.classificationDistribution.catalogLabelTotals,
    discoveryCategoryTotalsCatalog: a.discoveryStatistics.catalogCategoryTotals,
    discoveryStats: {
      totalFindings: a.discoveryStatistics.totalMappedFieldRows,
      distinctDatasetsWithFindings: a.discoveryStatistics.distinctDatasetsWithMappedFindings,
      categoryDistribution: a.discoveryStatistics.mappedFieldRowsByCategory
    },
    profiling: {
      datasetsProfiled: a.profilingStatistics.datasetsProfiled,
      avgDataCompleteness: a.profilingStatistics.averageDataCompleteness,
      anomalyCount: a.profilingStatistics.totalAnomalies
    },
    mapping: {
      systems: a.mappingRelationships.systems,
      datasets: a.mappingRelationships.datasets,
      flows: a.mappingRelationships.dataFlows,
      fields: a.mappingRelationships.mappedFields
    },
    sourceBreakdown,
    /** Extended fields aligned with `/dashboard/analytics` (non-breaking for clients that ignore unknown keys). */
    classificationDistribution: a.classificationDistribution,
    profilingStatistics: a.profilingStatistics,
    mappingRelationships: a.mappingRelationships,
    discoveryStatistics: a.discoveryStatistics
  };

  auditDashboard("api:dashboard/summary", started, {
    datasetsInCatalog: a.catalogAndInventoryCounts.datasetsInCatalog,
    mappedFields: a.catalogAndInventoryCounts.mappedFields
  });

  return res.json(payload);
});

export default router;
