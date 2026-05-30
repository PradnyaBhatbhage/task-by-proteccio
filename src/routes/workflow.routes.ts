import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auditTrail } from "../audit";
import { classifyDiscoveryScan } from "../classification";
import { governanceCatalog } from "../catalog";
import { scanRecords, type SourceType } from "../discovery";
import { mappingRegistry } from "../mapping";
import { buildRiskPrioritization } from "../risk";
import { createTicketsFromPrioritization } from "../remediation";
import { generateReport } from "../reporting";
import { getDashboardAnalytics } from "../services/dashboard-analytics-cache";
import { normalizeRecords } from "../services/normalizer";
import { getActorId } from "../middleware/authenticate";
import { persistDiscoveryRun } from "../supabase/persistence";
import { persistWorkflowRun } from "../supabase/governance-persistence";

const router = Router();

const WorkflowSchema = z.object({
  records: z.array(z.record(z.string(), z.any())).min(1).max(5000),
  sourceType: z.enum(["database", "cloud", "file", "api"]).default("file"),
  sourceName: z.string().min(1).max(512).default("workflow-workbench"),
  entityName: z.string().min(1).max(512).default("sample-records.json"),
  schemaMapping: z.record(z.string(), z.string()).optional(),
  createRemediation: z.boolean().optional().default(true),
  reportFormat: z.enum(["json", "csv", "pdf"]).optional().default("json")
});

/**
 * POST /api/workflow/run
 * Runs the complete prototype flow:
 * ingestion normalization -> discovery -> classification -> mapping -> profiling/catalog ->
 * risk/compliance -> remediation -> report -> dashboard payload.
 */
router.post("/workflow/run", async (req, res, next) => {
  const started = Date.now();
  const workflowRunId = randomUUID();
  const parsed = WorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    auditTrail.append({
      source: "api:workflow/run",
      action: "workflow_run",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "validation_error" }
    });
    return res.status(400).json({ error: "Invalid workflow payload", details: parsed.error.flatten() });
  }

  try {
    const input = parsed.data;
    const records = normalizeRecords(input.records, { schemaMapping: input.schemaMapping });
    const discovery = scanRecords(records, {
      sourceType: input.sourceType as SourceType,
      sourceName: input.sourceName,
      entityName: input.entityName
    });
    const classification = classifyDiscoveryScan(discovery);
    const mapping = mappingRegistry.ingestDiscoveryScan(discovery, classification);
    const catalog = governanceCatalog.upsertFromScan({
      discovery,
      classification,
      records,
      exposureHints: {
        noLineageFlows: mappingRegistry.listFlows().length === 0,
        unmappedDataset: false
      }
    });

    const priorityQueue = buildRiskPrioritization(governanceCatalog.list(), {
      minLevel: "medium",
      limit: 25
    });
    const remediation = input.createRemediation
      ? createTicketsFromPrioritization(priorityQueue, new Map(governanceCatalog.list().map((s) => [s.datasetId, s])), {
          limit: 25,
          skipExistingForDataset: true
        })
      : { created: [], skipped: [] };

    const report = await generateReport({
      reportType: "executive_summary",
      format: input.reportFormat,
      generatedBy: getActorId(req),
      tags: ["week4", "workflow"]
    });
    const dashboard = getDashboardAnalytics();
    const supabase = await persistDiscoveryRun({
      discovery,
      classification,
      catalogSnapshot: catalog,
      actorId: getActorId(req)
    });
    void persistWorkflowRun({
      id: workflowRunId,
      status: "success",
      durationMs: Date.now() - started,
      actorId: getActorId(req),
      datasetId: catalog.datasetId,
      reportId: report.record.id,
      payload: {
        sourceType: input.sourceType,
        sourceName: input.sourceName,
        entityName: input.entityName,
        scannedRecords: discovery.scannedRecords,
        fieldsCreated: mapping.fields.length,
        remediationCreated: remediation.created.length
      }
    });

    auditTrail.append({
      source: "api:workflow/run",
      action: "workflow_run",
      status: "success",
      durationMs: Date.now() - started,
      metadata: {
        datasetId: catalog.datasetId,
        scannedRecords: discovery.scannedRecords,
        fieldsCreated: mapping.fields.length,
        remediationCreated: remediation.created.length,
        reportId: report.record.id
      }
    });

    return res.status(201).json({
      ingestion: {
        workflowRunId,
        recordCount: records.length,
        sourceType: input.sourceType,
        sourceName: input.sourceName,
        entityName: input.entityName
      },
      discovery,
      classification,
      mapping: {
        system: mapping.system,
        dataset: mapping.dataset,
        fieldsCreated: mapping.fields.length,
        fields: mapping.fields
      },
      profiling: catalog.profile,
      risk: catalog.risk,
      compliance: catalog.risk.analysis?.complianceIntelligence,
      remediation,
      reporting: {
        id: report.record.id,
        title: report.record.title,
        format: report.download.format,
        fileName: report.download.fileName,
        summary: report.record.summary
      },
      dashboard,
      supabase
    });
  } catch (err) {
    void persistWorkflowRun({
      id: workflowRunId,
      status: "failure",
      durationMs: Date.now() - started,
      actorId: getActorId(req),
      payload: {
        error: err instanceof Error ? err.message : "Workflow failed"
      }
    });
    auditTrail.append({
      source: "api:workflow/run",
      action: "workflow_run",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { error: err instanceof Error ? err.name : "unknown" }
    });
    return next(err);
  }
});

export default router;
