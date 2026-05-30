import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import { governanceCatalog } from "../catalog";
import { buildProfilingReport } from "../profiling";
import { assessRisk, mergeExposureHintsForDiscovery, type RiskExposureHints } from "../risk";
import { looksLikeClassificationScanResult, looksLikeDiscoveryScanResult } from "../utils/scan-payload";
import { evaluatePostScanAlerts } from "../alerting";
import { getActorId } from "../middleware/authenticate";
import { persistDiscoveryRun } from "../supabase/persistence";

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

const ProfilingBodySchema = z.object({
  discovery: z.unknown(),
  classification: z.unknown().optional(),
  records: z.array(z.record(z.string(), z.any())).optional(),
  persist: z.boolean().optional(),
  profilingOptions: z
    .object({
      maxRecordsForStructure: z.number().int().positive().max(50_000).optional(),
      chunkSize: z.number().int().positive().max(5000).optional(),
      maxFieldsInNullAnalysis: z.number().int().positive().max(2000).optional(),
      maxDistinctPerField: z.number().int().positive().max(50_000).optional(),
      maxDuplicateGroups: z.number().int().positive().max(500).optional()
    })
    .optional(),
  exposureHints: z
    .object({
      hasApiExposureFlow: z.boolean().optional(),
      hasReplicationOrBackupFlow: z.boolean().optional(),
      isPubliclyExposed: z.boolean().optional(),
      encryptionIndicated: z.boolean().optional(),
      crossDatasetDuplicateGroupCount: z.number().int().nonnegative().optional(),
      unmappedDataset: z.boolean().optional(),
      noLineageFlows: z.boolean().optional(),
      daysSinceLastActivity: z.number().int().nonnegative().optional(),
      complianceControls: ComplianceControlHintsSchema.optional()
    })
    .optional()
});

/**
 * POST /api/profiling/profile
 * Computes profiling intelligence + risk scoring from discovery (and optional classification / record batch).
 */
router.post("/profiling/profile", async (req, res, next) => {
  const started = Date.now();
  const parsed = ProfilingBodySchema.safeParse(req.body);
  if (!parsed.success) {
    auditTrail.append({
      source: "api:profiling/profile",
      action: "profiling",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "validation_error" }
    });
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const body = parsed.data;
  if (!looksLikeDiscoveryScanResult(body.discovery)) {
    auditTrail.append({
      source: "api:profiling/profile",
      action: "profiling",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "invalid_discovery" }
    });
    return res.status(400).json({ error: "Body.discovery must be a valid DiscoveryScanResult." });
  }

  const classification =
    body.classification !== undefined && looksLikeClassificationScanResult(body.classification)
      ? body.classification
      : undefined;

  try {
    const profile = buildProfilingReport(body.discovery, classification, body.records, body.profilingOptions);
    const mergedHints = mergeExposureHintsForDiscovery(
      body.discovery,
      body.exposureHints as RiskExposureHints | undefined,
      profile
    );
    const risk = assessRisk(body.discovery, classification, mergedHints, profile);
    if (risk.analysis) {
      evaluatePostScanAlerts(body.discovery, risk.analysis);
    }

    let catalogSnapshot = undefined as ReturnType<typeof governanceCatalog.get> | undefined;
    if (body.persist === true) {
      catalogSnapshot = governanceCatalog.upsertFromScan({
        discovery: body.discovery,
        classification,
        records: body.records,
        profilingOptions: body.profilingOptions,
        exposureHints: body.exposureHints as RiskExposureHints | undefined
      });
    }

    auditTrail.append({
      source: "api:profiling/profile",
      action: "profiling",
      status: "success",
      durationMs: Date.now() - started,
      metadata: {
        persist: Boolean(body.persist),
        totalRecords: profile.totalRecords,
        sensitiveRecordCount: profile.sensitiveRecordCount,
        riskLevel: risk.level
      }
    });

    const supabase = catalogSnapshot
      ? await persistDiscoveryRun({
          discovery: body.discovery,
          classification,
          catalogSnapshot,
          actorId: getActorId(req)
        })
      : undefined;

    return res.json({ profile, risk, catalog: catalogSnapshot, supabase });
  } catch (err) {
    auditTrail.append({
      source: "api:profiling/profile",
      action: "profiling",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { error: err instanceof Error ? err.name : "Error" }
    });
    return next(err instanceof Error ? err : new Error("Profiling failed"));
  }
});

const RegisterBodySchema = ProfilingBodySchema;

/**
 * POST /api/catalog/register
 * Persists profiling + risk snapshot into the in-memory governance catalog (swap for DB later).
 */
router.post("/catalog/register", (req, res) => {
  const started = Date.now();
  const parsed = RegisterBodySchema.safeParse(req.body);
  if (!parsed.success) {
    auditTrail.append({
      source: "api:catalog/register",
      action: "catalog_upsert",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "validation_error" }
    });
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const body = parsed.data;
  if (!looksLikeDiscoveryScanResult(body.discovery)) {
    auditTrail.append({
      source: "api:catalog/register",
      action: "catalog_upsert",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "invalid_discovery" }
    });
    return res.status(400).json({ error: "Body.discovery must be a valid DiscoveryScanResult." });
  }

  const classification =
    body.classification !== undefined && looksLikeClassificationScanResult(body.classification)
      ? body.classification
      : undefined;

  const snap = governanceCatalog.upsertFromScan({
    discovery: body.discovery,
    classification,
    records: body.records,
    profilingOptions: body.profilingOptions,
    exposureHints: body.exposureHints as RiskExposureHints | undefined
  });

  if (snap.risk.analysis) {
    evaluatePostScanAlerts(body.discovery, snap.risk.analysis);
  }

  auditTrail.append({
    source: "api:catalog/register",
    action: "catalog_upsert",
    status: "success",
    durationMs: Date.now() - started,
    metadata: {
      datasetId: snap.datasetId,
      riskLevel: snap.riskLevel,
      totalRecords: snap.totalRecords,
      sensitiveRecordCount: snap.sensitiveRecordCount
    }
  });

  void persistDiscoveryRun({
    discovery: body.discovery,
    classification,
    catalogSnapshot: snap,
    actorId: getActorId(req)
  }).catch(() => undefined);

  return res.status(201).json({ snapshot: snap });
});

/** GET /api/catalog/datasets — list registered governance snapshots (in-memory). */
router.get("/catalog/datasets", (_req, res) => {
  governanceCatalog.refreshMappedFlags();
  const datasets = governanceCatalog.list();
  return res.json({ count: datasets.length, datasets });
});

export default router;
