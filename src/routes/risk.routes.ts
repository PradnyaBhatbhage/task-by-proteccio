import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import { governanceCatalog } from "../catalog";
import { buildProfilingReport } from "../profiling";
import {
  aggregateRiskBySource,
  aggregateRiskBySystem,
  ALL_REGULATIONS,
  assessRisk,
  buildRiskPrioritization,
  COMPLIANCE_CONTROL_CATALOG,
  computeComplianceIntelligence,
  identifyHighRiskDatasets,
  mergeExposureHintsForDiscovery,
  REGULATION_LABELS,
  type RiskExposureHints,
  type RiskLevel
} from "../risk";
import { looksLikeClassificationScanResult, looksLikeDiscoveryScanResult } from "../utils/scan-payload";
import { evaluatePostScanAlerts } from "../alerting";

const router = Router();

const ComplianceControlHintsSchema = z.object({
  retentionPolicyIndicated: z.boolean().optional(),
  consentManagementIndicated: z.boolean().optional(),
  privacyNoticeIndicated: z.boolean().optional(),
  lawfulBasisDocumented: z.boolean().optional(),
  accessControlsIndicated: z.boolean().optional(),
  breachNotificationProcessIndicated: z.boolean().optional(),
  dataPrincipalRightsProcessIndicated: z.boolean().optional(),
  baaInPlace: z.boolean().optional(),
  phiAuditLoggingIndicated: z.boolean().optional(),
  optOutMechanismIndicated: z.boolean().optional(),
  ismsRiskAssessmentIndicated: z.boolean().optional(),
  purposeLimitationDocumented: z.boolean().optional(),
  crossBorderSafeguardsIndicated: z.boolean().optional(),
  consumerDisclosureIndicated: z.boolean().optional(),
  ismsDocumented: z.boolean().optional()
});

const ExposureHintsSchema = z.object({
  hasApiExposureFlow: z.boolean().optional(),
  hasReplicationOrBackupFlow: z.boolean().optional(),
  isPubliclyExposed: z.boolean().optional(),
  encryptionIndicated: z.boolean().optional(),
  crossDatasetDuplicateGroupCount: z.number().int().nonnegative().optional(),
  unmappedDataset: z.boolean().optional(),
  noLineageFlows: z.boolean().optional(),
  daysSinceLastActivity: z.number().int().nonnegative().optional(),
  complianceControls: ComplianceControlHintsSchema.optional()
});

const AnalyzeBodySchema = z.object({
  discovery: z.unknown(),
  classification: z.unknown().optional(),
  records: z.array(z.record(z.string(), z.any())).optional(),
  exposureHints: ExposureHintsSchema.optional(),
  weights: z.record(z.string(), z.number().min(0).max(1)).optional(),
  profilingOptions: z
    .object({
      maxRecordsForStructure: z.number().int().positive().max(50_000).optional(),
      chunkSize: z.number().int().positive().max(5000).optional()
    })
    .optional()
});

function parseRiskLevel(v: unknown): RiskLevel | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.toLowerCase();
  if (s === "low" || s === "medium" || s === "high" || s === "critical") return s;
  return undefined;
}

/**
 * POST /api/risk/analyze
 * Full Week 3 privacy risk analysis from discovery (+ optional classification / records).
 */
router.post("/risk/analyze", (req, res, next) => {
  const started = Date.now();
  const parsed = AnalyzeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    auditTrail.append({
      source: "api:risk/analyze",
      action: "risk_analysis",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "validation_error" }
    });
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const body = parsed.data;
  if (!looksLikeDiscoveryScanResult(body.discovery)) {
    return res.status(400).json({ error: "Body.discovery must be a valid DiscoveryScanResult." });
  }

  const classification =
    body.classification !== undefined && looksLikeClassificationScanResult(body.classification)
      ? body.classification
      : undefined;

  try {
    const profile = buildProfilingReport(
      body.discovery,
      classification,
      body.records,
      body.profilingOptions
    );
    const hints = mergeExposureHintsForDiscovery(
      body.discovery,
      body.exposureHints as RiskExposureHints | undefined,
      profile
    );
    const assessment = assessRisk(body.discovery, classification, hints, profile, body.weights);
    const analysis = assessment.analysis;
    if (analysis) {
      evaluatePostScanAlerts(body.discovery, analysis);
    }

    auditTrail.append({
      source: "api:risk/analyze",
      action: "risk_analysis",
      status: "success",
      durationMs: Date.now() - started,
      metadata: {
        riskLevel: analysis?.level,
        riskScore: analysis?.score,
        overexposedCount: analysis?.overexposedRecords.length,
        complianceScore: analysis?.compliance.score
      }
    });

    return res.json({ analysis, assessment, profile });
  } catch (err) {
    auditTrail.append({
      source: "api:risk/analyze",
      action: "risk_analysis",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { error: err instanceof Error ? err.name : "Error" }
    });
    return next(err instanceof Error ? err : new Error("Risk analysis failed"));
  }
});

/**
 * GET /api/risk/high-risk-datasets
 * Lists high/critical datasets from the governance catalog.
 */
router.get("/risk/high-risk-datasets", (req, res) => {
  const started = Date.now();
  governanceCatalog.refreshMappedFlags();
  const minLevel = (req.query.minLevel === "critical" ? "critical" : "high") as "high" | "critical";
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const datasets = identifyHighRiskDatasets(governanceCatalog.list(), { minLevel, limit });

  auditTrail.append({
    source: "api:risk/high-risk-datasets",
    action: "risk_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: { count: datasets.length, minLevel }
  });

  return res.json({ count: datasets.length, minLevel, datasets });
});

/**
 * GET /api/risk/prioritization
 * Ranked remediation queue from catalog snapshots.
 */
router.get("/risk/prioritization", (req, res) => {
  const started = Date.now();
  governanceCatalog.refreshMappedFlags();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const minLevel = parseRiskLevel(req.query.minLevel) ?? "medium";
  const items = buildRiskPrioritization(governanceCatalog.list(), {
    limit,
    minLevel: minLevel === "low" ? undefined : minLevel
  });

  auditTrail.append({
    source: "api:risk/prioritization",
    action: "risk_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: { count: items.length }
  });

  return res.json({ count: items.length, items });
});

/**
 * GET /api/risk/aggregation/sources
 * Risk aggregation grouped by source instance (sourceType + sourceName).
 */
router.get("/risk/aggregation/sources", (_req, res) => {
  governanceCatalog.refreshMappedFlags();
  const sources = aggregateRiskBySource(governanceCatalog.list());
  return res.json({ count: sources.length, sources });
});

/**
 * GET /api/risk/aggregation/systems
 * Risk aggregation grouped by logical system id.
 */
router.get("/risk/aggregation/systems", (_req, res) => {
  governanceCatalog.refreshMappedFlags();
  const systems = aggregateRiskBySystem(governanceCatalog.list());
  return res.json({ count: systems.length, systems });
});

/**
 * POST /api/risk/compliance
 * Compliance intelligence: regulations, control gaps, flags, remediation.
 */
router.post("/risk/compliance", (req, res, next) => {
  const started = Date.now();
  const parsed = AnalyzeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }
  const body = parsed.data;
  if (!looksLikeDiscoveryScanResult(body.discovery)) {
    return res.status(400).json({ error: "Body.discovery must be a valid DiscoveryScanResult." });
  }
  const classification =
    body.classification !== undefined && looksLikeClassificationScanResult(body.classification)
      ? body.classification
      : undefined;

  try {
    const profile = buildProfilingReport(
      body.discovery,
      classification,
      body.records,
      body.profilingOptions
    );
    const hints = mergeExposureHintsForDiscovery(
      body.discovery,
      body.exposureHints as RiskExposureHints | undefined,
      profile
    );
    const assessment = assessRisk(body.discovery, classification, hints, profile, body.weights);
    const intelligence =
      assessment.analysis?.complianceIntelligence ??
      computeComplianceIntelligence(body.discovery, classification, assessment.analysis?.factors ?? [], hints);

    auditTrail.append({
      source: "api:risk/compliance",
      action: "compliance_intelligence",
      status: "success",
      durationMs: Date.now() - started,
      metadata: {
        status: intelligence.status,
        flagCount: intelligence.flags.length,
        regulationCount: intelligence.applicableRegulations.length
      }
    });

    return res.json({ compliance: intelligence });
  } catch (err) {
    auditTrail.append({
      source: "api:risk/compliance",
      action: "compliance_intelligence",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { error: err instanceof Error ? err.name : "Error" }
    });
    return next(err instanceof Error ? err : new Error("Compliance intelligence failed"));
  }
});

/**
 * GET /api/risk/compliance/catalog
 * Static catalog of supported regulations and control definitions.
 */
router.get("/risk/compliance/catalog", (_req, res) => {
  return res.json({
    regulations: ALL_REGULATIONS.map((id) => ({ id, label: REGULATION_LABELS[id] })),
    controls: COMPLIANCE_CONTROL_CATALOG
  });
});

/**
 * GET /api/risk/compliance-exposure
 * Compliance exposure summary across catalog datasets.
 */
router.get("/risk/compliance-exposure", (_req, res) => {
  governanceCatalog.refreshMappedFlags();
  const rows = governanceCatalog.list();
  const exposures = rows.map((r) => {
    const intel = r.risk.analysis?.complianceIntelligence;
    const compliance = r.risk.analysis?.compliance ?? {
      score: Math.round(r.risk.score * 0.85),
      level: r.riskLevel,
      drivingLabels: [],
      frameworks: [],
      factors: []
    };
    return {
      datasetId: r.datasetId,
      entityName: r.trace.entityName,
      sourceName: r.trace.sourceName,
      compliance,
      complianceStatus: intel?.status,
      applicableRegulations: intel?.applicableRegulations ?? compliance.frameworks,
      flagCount: intel?.flags.length ?? 0
    };
  });
  const avgScore =
    exposures.length === 0 ? 0 : Math.round(exposures.reduce((a, e) => a + e.compliance.score, 0) / exposures.length);
  return res.json({
    datasetCount: exposures.length,
    averageComplianceScore: avgScore,
    exposures: exposures.sort((a, b) => b.compliance.score - a.compliance.score)
  });
});

export default router;
