import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import {
  catalogExceedsAsyncThreshold,
  downloadReport,
  enqueueReportGeneration,
  generateReport,
  getReportContent,
  reportQueue,
  reportStore,
  EXPORT_FORMATS,
  REPORT_TYPES,
  type ExportFormat,
  type ReportType
} from "../reporting";
import { getActorId } from "../middleware/authenticate";
import { reportRateLimiter } from "../middleware/rate-limit";

const router = Router();

const REPORT_TYPE_IDS = REPORT_TYPES.map((t) => t.id);
const FORMATS = EXPORT_FORMATS;

function parseReportType(raw: unknown): ReportType | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw);
  return REPORT_TYPE_IDS.includes(s as ReportType) ? (s as ReportType) : undefined;
}

function parseFormat(raw: unknown): ExportFormat | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  return FORMATS.includes(s as ExportFormat) ? (s as ExportFormat) : undefined;
}

const GenerateBodySchema = z.object({
  reportType: z.enum([
    "privacy_risk",
    "compliance",
    "source_discovery",
    "classification_summary",
    "remediation",
    "executive_summary"
  ]),
  format: z.enum(["json", "csv", "pdf"]),
  generatedBy: z.string().min(1).max(256).optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  /** When true (or when catalog exceeds ASYNC_REPORT_THRESHOLD_DATASETS), generation runs in background. */
  async: z.boolean().optional()
});

/**
 * GET /api/reports/types
 * Lists supported report templates and export formats.
 */
router.get("/reports/types", (_req, res) => {
  return res.json({
    reportTypes: REPORT_TYPES,
    exportFormats: FORMATS
  });
});

/**
 * GET /api/reports?reportType=&format=&q=&generatedFrom=&generatedTo=&page=&pageSize=
 * Searchable report history (metadata only; use GET /reports/:id for full content).
 */
router.get("/reports", (req, res) => {
  const started = Date.now();
  const pageRaw = req.query.page !== undefined ? Number(req.query.page) : 1;
  const pageSizeRaw = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 25;
  const page = z.number().int().positive().safeParse(pageRaw).success ? pageRaw : 1;
  const pageSize = z.number().int().positive().max(100).safeParse(pageSizeRaw).success ? pageSizeRaw : 25;

  const reportType = parseReportType(req.query.reportType);
  const format = parseFormat(req.query.format);
  const q = req.query.q !== undefined ? String(req.query.q) : undefined;
  const generatedFrom = req.query.generatedFrom !== undefined ? String(req.query.generatedFrom) : undefined;
  const generatedTo = req.query.generatedTo !== undefined ? String(req.query.generatedTo) : undefined;

  const result = reportStore.query({
    reportType,
    format,
    q,
    generatedFrom,
    generatedTo,
    page,
    pageSize
  });

  auditTrail.append({
    source: "api:reports",
    action: "report_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: { total: result.total, page: result.page }
  });

  return res.json(result);
});

/**
 * POST /api/reports/generate
 * Generate a timestamped audit-ready report and return metadata plus export body.
 */
router.post("/reports/generate", reportRateLimiter, async (req, res, next) => {
  const started = Date.now();
  const parsed = GenerateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    auditTrail.append({
      source: "api:reports/generate",
      action: "report_generate",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "validation_error" }
    });
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  try {
    const input = {
      reportType: parsed.data.reportType,
      format: parsed.data.format,
      generatedBy: parsed.data.generatedBy ?? getActorId(req),
      tags: parsed.data.tags
    };

    const useAsync = parsed.data.async === true || catalogExceedsAsyncThreshold();
    if (useAsync) {
      const job = enqueueReportGeneration(input, parsed.data.async);
      if (job) {
        auditTrail.append({
          source: "api:reports/generate",
          action: "report_generate",
          status: "success",
          durationMs: Date.now() - started,
          metadata: { jobId: job.id, async: true, reportType: input.reportType }
        });
        return res.status(202).json({
          async: true,
          job: {
            id: job.id,
            status: job.status,
            enqueuedAt: job.enqueuedAt,
            pollUrl: `/api/reports/jobs/${job.id}`
          },
          message:
            "Report generation queued. Poll GET /api/reports/jobs/:id until status is completed, then fetch the report."
        });
      }
    }

    const result = await generateReport(input);
    auditTrail.append({
      source: "api:reports/generate",
      action: "report_generate",
      status: "success",
      durationMs: Date.now() - started,
      metadata: {
        reportId: result.record.id,
        reportType: result.record.reportType,
        format: parsed.data.format
      }
    });

    const isBinary = parsed.data.format === "pdf";
    if (isBinary) {
      return res.status(201).json({
        report: {
          id: result.record.id,
          reportType: result.record.reportType,
          title: result.record.title,
          generatedAt: result.record.generatedAt,
          primaryFormat: result.record.primaryFormat,
          summary: result.record.summary,
          tags: result.record.tags,
          fileBaseName: result.record.fileBaseName,
          download: {
            format: result.download.format,
            fileName: result.download.fileName,
            contentType: result.download.contentType,
            encoding: "base64",
            data: (result.download.body as Buffer).toString("base64")
          }
        }
      });
    }

    return res.status(201).json({
      report: {
        id: result.record.id,
        reportType: result.record.reportType,
        title: result.record.title,
        generatedAt: result.record.generatedAt,
        primaryFormat: result.record.primaryFormat,
        summary: result.record.summary,
        tags: result.record.tags,
        fileBaseName: result.record.fileBaseName,
        download: {
          format: result.download.format,
          fileName: result.download.fileName,
          contentType: result.download.contentType,
          data: result.download.body
        }
      },
      content: result.record.content
    });
  } catch (err) {
    auditTrail.append({
      source: "api:reports/generate",
      action: "report_generate",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "internal_error" }
    });
    return next(err);
  }
});

/**
 * GET /api/reports/jobs/:jobId
 * Poll async report generation status; includes export payload when completed.
 */
router.get("/reports/jobs/:jobId", (req, res) => {
  const started = Date.now();
  const job = reportQueue.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Report job not found" });
  }

  auditTrail.append({
    source: "api:reports/jobs/:jobId",
    action: "report_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: { jobId: job.id, status: job.status }
  });

  const payload: Record<string, unknown> = {
    id: job.id,
    status: job.status,
    reportType: job.input.reportType,
    format: job.input.format,
    enqueuedAt: job.enqueuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    recordId: job.recordId,
    error: job.error
  };

  if (job.status === "completed" && job.export && job.recordId) {
    const isBinary = job.input.format === "pdf";
    payload.report = { id: job.recordId };
    payload.download = isBinary
      ? {
          format: job.export.format,
          fileName: job.export.fileName,
          contentType: job.export.contentType,
          encoding: "base64",
          data: (job.export.body as Buffer).toString("base64")
        }
      : {
          format: job.export.format,
          fileName: job.export.fileName,
          contentType: job.export.contentType,
          data: job.export.body
        };
  }

  const httpStatus = job.status === "completed" ? 200 : job.status === "failed" ? 500 : 202;
  return res.status(httpStatus).json(payload);
});

/**
 * GET /api/reports/:id/download?format=json|csv|pdf
 * Download a stored report in the requested export format.
 */
router.get("/reports/:id/download", async (req, res, next) => {
  const started = Date.now();
  const record = reportStore.get(req.params.id);
  if (!record) {
    auditTrail.append({
      source: "api:reports/:id/download",
      action: "report_query",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "not_found" }
    });
    return res.status(404).json({ error: "Report not found" });
  }

  const format = parseFormat(req.query.format) ?? record.primaryFormat;

  try {
    const { body, contentType, fileName } = await downloadReport(record, format);

    auditTrail.append({
      source: "api:reports/:id/download",
      action: "report_query",
      status: "success",
      durationMs: Date.now() - started,
      metadata: { reportId: record.id, format }
    });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(body);
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/reports/:id
 * Returns full structured report content for a stored report.
 */
router.get("/reports/:id", (req, res) => {
  const started = Date.now();
  const record = reportStore.get(req.params.id);
  if (!record) {
    auditTrail.append({
      source: "api:reports/:id",
      action: "report_query",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "not_found" }
    });
    return res.status(404).json({ error: "Report not found" });
  }

  auditTrail.append({
    source: "api:reports/:id",
    action: "report_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: { reportId: record.id, reportType: record.reportType }
  });

  return res.json({
    id: record.id,
    reportType: record.reportType,
    title: record.title,
    generatedAt: record.generatedAt,
    primaryFormat: record.primaryFormat,
    summary: record.summary,
    tags: record.tags,
    generatedBy: record.generatedBy,
    fileBaseName: record.fileBaseName,
    content: getReportContent(record)
  });
});

export default router;
