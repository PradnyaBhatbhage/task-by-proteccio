import { env } from "../config/env";
import { governanceCatalog } from "../catalog";
import type { GovernanceDatasetSnapshot } from "../catalog/types";
import { remediationStore } from "../remediation/store";
import { aggregateRiskBySource } from "../risk/aggregation";
import { buildRiskPrioritization, identifyHighRiskDatasets } from "../risk/prioritization";
import { getDashboardAnalytics } from "../services/dashboard-analytics-cache";
import type { DashboardAnalytics } from "../services/dashboard-analytics.service";
import type { ReportContent, ReportSection, ReportType } from "./types";

function section(
  id: string,
  title: string,
  data: ReportSection["data"],
  description?: string
): ReportSection {
  return { id, title, description, data };
}

function titleForType(reportType: ReportType): string {
  const labels: Record<ReportType, string> = {
    privacy_risk: "Privacy Risk Report",
    compliance: "Compliance Report",
    source_discovery: "Source-wise Discovery Report",
    classification_summary: "Classification Summary Report",
    remediation: "Remediation Report",
    executive_summary: "Executive Summary Report"
  };
  return labels[reportType];
}

export interface ReportBuildContext {
  analytics: DashboardAnalytics;
  catalogRows: GovernanceDatasetSnapshot[];
}

function createBuildContext(): ReportBuildContext {
  governanceCatalog.refreshMappedFlags();
  const analytics = getDashboardAnalytics(false);
  return { analytics, catalogRows: governanceCatalog.list() };
}

function buildPrivacyRiskSections(ctx: ReportBuildContext): ReportSection[] {
  const { analytics, catalogRows: rows } = ctx;
  const prioritization = buildRiskPrioritization(rows, { limit: 50, minLevel: "medium" });
  const highRisk = identifyHighRiskDatasets(rows, { minLevel: "high", limit: 25 });
  const bySource = aggregateRiskBySource(rows);

  return [
    section("overview", "Risk Overview", {
      riskDistribution: analytics.riskDistribution,
      highRiskDatasetCount: analytics.highRiskDatasets.count,
      highRiskSourceCount: analytics.highRiskSourceCount,
      totalScannedRecords: analytics.totalScannedRecords,
      totalSensitiveRecords: analytics.totalSensitiveRecords
    }),
    section("high_risk_datasets", "High-Risk Datasets", highRisk),
    section("prioritization_queue", "Remediation Prioritization Queue", prioritization),
    section("risk_by_source", "Risk Aggregation by Source", bySource)
  ];
}

function buildComplianceSections(ctx: ReportBuildContext): ReportSection[] {
  const { analytics, catalogRows: rows } = ctx;
  const maxRows = env.REPORT_MAX_COMPLIANCE_ROWS;

  const nonCompliant = rows.filter(
    (r) =>
      r.risk.analysis?.complianceIntelligence?.status === "non_compliant" ||
      r.risk.analysis?.complianceIntelligence?.status === "partial"
  );
  const datasetCompliance = (nonCompliant.length > 0 ? nonCompliant : rows)
    .slice(0, maxRows)
    .map((r) => ({
      datasetId: r.datasetId,
      systemId: r.systemId,
      sourceType: r.trace.sourceType,
      sourceName: r.trace.sourceName,
      entityName: r.trace.entityName,
      riskLevel: r.riskLevel,
      complianceStatus: r.risk.analysis?.complianceIntelligence?.status ?? "unknown",
      applicableRegulations: r.risk.analysis?.complianceIntelligence?.applicableRegulations ?? [],
      violatedControlCount: r.risk.analysis?.complianceIntelligence?.violatedControls.length ?? 0,
      missingControlCount: r.risk.analysis?.complianceIntelligence?.missingControls.length ?? 0,
      flagCount: r.risk.analysis?.complianceIntelligence?.flags.length ?? 0,
      regulatoryExposureScore:
        r.risk.analysis?.complianceIntelligence?.regulatoryRiskExposure.score ?? null
    }));

  return [
    section("violations_summary", "Compliance Violations Summary", analytics.complianceViolations),
    section("dataset_compliance", "Per-Dataset Compliance Posture", {
      rows: datasetCompliance,
      totalDatasets: rows.length,
      truncated: rows.length > maxRows
    })
  ];
}

function buildSourceDiscoverySections(ctx: ReportBuildContext): ReportSection[] {
  const { analytics } = ctx;
  const sourceRows = Object.entries(analytics.sourceWiseBreakdown).map(([key, entry]) => ({
    sourceKey: key,
    ...entry
  }));

  return [
    section("discovery_totals", "Discovery Statistics", analytics.discoveryStatistics),
    section("source_breakdown", "Source-wise Breakdown", sourceRows),
    section("source_heatmap", "Source Risk Heatmap", analytics.sourceRiskHeatmap.sources)
  ];
}

function buildClassificationSections(ctx: ReportBuildContext): ReportSection[] {
  const { analytics } = ctx;
  const catalogLabels = Object.entries(analytics.classificationDistribution.catalogLabelTotals).map(
    ([label, count]) => ({ label, count, scope: "catalog" })
  );
  const mappedLabels = Object.entries(analytics.classificationDistribution.mappedFieldLabelTotals).map(
    ([label, count]) => ({ label, count, scope: "mapped_fields" })
  );

  return [
    section("catalog_labels", "Catalog Label Totals", catalogLabels),
    section("mapped_field_labels", "Mapped Field Label Totals", mappedLabels),
    section("distribution", "Combined Distribution", analytics.classificationDistribution)
  ];
}

function buildRemediationSections(ctx: ReportBuildContext): ReportSection[] {
  const { analytics } = ctx;
  const maxTickets = env.REPORT_MAX_REMEDIATION_TICKETS;
  const all = remediationStore.list();
  const tickets = all.slice(0, maxTickets).map((t) => ({
    id: t.id,
    source: t.source,
    riskType: t.riskType,
    classificationCategory: t.classificationCategory,
    severity: t.severity,
    status: t.status,
    datasetId: t.datasetId ?? null,
    assignedUser: t.assignedUser ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    historyEntryCount: t.history.length
  }));

  return [
    section("status_metrics", "Remediation Status Metrics", analytics.remediationStatus),
    section("tickets", "Remediation Tickets", {
      rows: tickets,
      totalTickets: all.length,
      truncated: all.length > maxTickets
    })
  ];
}

function buildExecutiveSections(ctx: ReportBuildContext): ReportSection[] {
  const { analytics } = ctx;
  return [
    section("kpis", "Executive KPIs", {
      generatedAt: analytics.generatedAt,
      totalScannedSources: analytics.totalScannedSources,
      totalScannedRecords: analytics.totalScannedRecords,
      totalSensitiveRecords: analytics.totalSensitiveRecords,
      highRiskDatasets: analytics.highRiskDatasets.count,
      complianceViolations: analytics.complianceViolations.datasetsWithViolations,
      openRemediationIssues: analytics.remediationStatus.openVsResolved.active,
      resolvedRemediationIssues: analytics.remediationStatus.openVsResolved.completed,
      catalogDatasets: analytics.catalogAndInventoryCounts.datasetsInCatalog,
      mappedFields: analytics.catalogAndInventoryCounts.mappedFields
    }),
    section("risk_distribution", "Risk Distribution", analytics.riskDistribution),
    section("compliance_snapshot", "Compliance Snapshot", analytics.complianceViolations),
    section("top_exposed_systems", "Most Exposed Systems", analytics.mostExposedSystems.slice(0, 10)),
    section("remediation_snapshot", "Remediation Snapshot", analytics.remediationStatus.openVsResolved)
  ];
}

const BUILDERS: Record<ReportType, (ctx: ReportBuildContext) => ReportSection[]> = {
  privacy_risk: buildPrivacyRiskSections,
  compliance: buildComplianceSections,
  source_discovery: buildSourceDiscoverySections,
  classification_summary: buildClassificationSections,
  remediation: buildRemediationSections,
  executive_summary: buildExecutiveSections
};

const SUMMARIES: Record<ReportType, (analytics: DashboardAnalytics) => string> = {
  privacy_risk: (a) =>
    `${a.highRiskDatasets.count} high/critical datasets across ${a.totalScannedSources} sources; ${a.totalSensitiveRecords} sensitive records identified.`,
  compliance: (a) =>
    `${a.complianceViolations.datasetsWithViolations} datasets with compliance flags; ${a.complianceViolations.datasetsNonCompliant} non-compliant.`,
  source_discovery: (a) =>
    `${a.totalScannedSources} sources scanned; ${a.discoveryStatistics.catalogDatasetsWithDetections} datasets with detections.`,
  classification_summary: (a) => {
    const labelCount = Object.keys(a.classificationDistribution.catalogLabelTotals).length;
    return `${labelCount} distinct privacy labels in catalog; ${a.catalogAndInventoryCounts.mappedFields} mapped fields tracked.`;
  },
  remediation: (a) =>
    `${a.remediationStatus.totalTickets} remediation tickets; ${a.remediationStatus.openVsResolved.active} active, ${a.remediationStatus.openVsResolved.completed} completed.`,
  executive_summary: (a) =>
    `Governance posture: ${a.totalScannedRecords} records, ${a.highRiskDatasets.count} high-risk datasets, ${a.complianceViolations.datasetsWithViolations} compliance issues.`
};

/**
 * Builds structured, audit-ready report content for the given template.
 * Uses a single dashboard analytics pass shared across all sections.
 */
export function buildReportContent(
  reportType: ReportType,
  options?: { generatedBy?: string }
): ReportContent {
  const ctx = createBuildContext();
  const generatedAt = new Date().toISOString();
  const sections = BUILDERS[reportType](ctx);

  return {
    reportType,
    title: titleForType(reportType),
    generatedAt,
    summary: SUMMARIES[reportType](ctx.analytics),
    sections,
    metadata: {
      datasetsInCatalog: ctx.analytics.catalogAndInventoryCounts.datasetsInCatalog,
      totalScannedRecords: ctx.analytics.totalScannedRecords,
      totalSensitiveRecords: ctx.analytics.totalSensitiveRecords,
      generatedBy: options?.generatedBy
    }
  };
}
