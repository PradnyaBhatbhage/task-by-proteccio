import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import { governanceCatalog } from "../catalog";
import {
  createTicketsFromPrioritization,
  remediationStore,
  type RemediationSeverity,
  type RemediationStatus
} from "../remediation";
import { buildRiskPrioritization } from "../risk";
import { getActorId } from "../middleware/authenticate";

const router = Router();

const SEVERITIES: RemediationSeverity[] = ["low", "medium", "high", "critical"];
const STATUSES: RemediationStatus[] = ["open", "in_progress", "resolved", "closed"];

function parseSeverity(raw: unknown): RemediationSeverity | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  return SEVERITIES.includes(s as RemediationSeverity) ? (s as RemediationSeverity) : undefined;
}

function parseStatus(raw: unknown): RemediationStatus | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase().replace(/\s+/g, "_");
  return STATUSES.includes(s as RemediationStatus) ? (s as RemediationStatus) : undefined;
}

const CreateBodySchema = z.object({
  source: z.string().min(1).max(512),
  riskType: z.string().min(1).max(256),
  classificationCategory: z.string().min(1).max(256),
  suggestedAction: z.string().min(1).max(4096),
  severity: z.enum(["low", "medium", "high", "critical"]),
  assignedUser: z.string().min(1).max(256).optional(),
  resolutionNotes: z.string().max(4096).optional(),
  datasetId: z.string().max(256).optional(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional()
});

const UpdateBodySchema = z
  .object({
    source: z.string().min(1).max(512).optional(),
    riskType: z.string().min(1).max(256).optional(),
    classificationCategory: z.string().min(1).max(256).optional(),
    suggestedAction: z.string().min(1).max(4096).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    assignedUser: z.string().min(1).max(256).nullable().optional(),
    resolutionNotes: z.string().max(4096).nullable().optional(),
    actor: z.string().max(256).optional()
  })
  .refine((b) => Object.keys(b).some((k) => k !== "actor"), { message: "At least one field to update is required" });

const FromPrioritizationBodySchema = z.object({
  minLevel: z.enum(["medium", "high", "critical"]).optional(),
  limit: z.number().int().positive().max(200).optional(),
  skipExistingForDataset: z.boolean().optional()
});

/**
 * POST /api/remediation
 * Create a remediation ticket.
 */
router.post("/remediation", (req, res, next) => {
  const started = Date.now();
  const parsed = CreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    auditTrail.append({
      source: "api:remediation",
      action: "remediation_create",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "validation_error" }
    });
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  try {
    const ticket = remediationStore.create(parsed.data);
    auditTrail.append({
      source: "api:remediation",
      action: "remediation_create",
      status: "success",
      durationMs: Date.now() - started,
      metadata: {
        ticketId: ticket.id,
        severity: ticket.severity,
        status: ticket.status,
        datasetId: ticket.datasetId ?? null
      }
    });
    return res.status(201).json({ item: ticket });
  } catch (err) {
    auditTrail.append({
      source: "api:remediation",
      action: "remediation_create",
      status: "failure",
      durationMs: Date.now() - started
    });
    return next(err);
  }
});

/**
 * GET /api/remediation?q=&status=&severity=&datasetId=&page=&pageSize=
 * Search and filter remediation records.
 */
router.get("/remediation", (req, res) => {
  const started = Date.now();
  const status = parseStatus(req.query.status);
  const severity = parseSeverity(req.query.severity);
  const q = req.query.q !== undefined ? String(req.query.q) : undefined;
  const datasetId = req.query.datasetId !== undefined ? String(req.query.datasetId) : undefined;
  const unresolved =
    req.query.unresolved === "true" ||
    req.query.unresolved === "1" ||
    req.query.unresolvedOnly === "true" ||
    req.query.unresolvedOnly === "1";

  const pageRaw = req.query.page !== undefined ? Number(req.query.page) : 1;
  const pageSizeRaw = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 25;
  const page = z.number().int().positive().safeParse(pageRaw).success ? pageRaw : 1;
  const pageSize = z.number().int().positive().max(200).safeParse(pageSizeRaw).success ? pageSizeRaw : 25;

  const result = remediationStore.query({
    status: unresolved ? undefined : status,
    unresolved: unresolved || undefined,
    severity,
    q,
    datasetId,
    page,
    pageSize
  });

  auditTrail.append({
    source: "api:remediation",
    action: "remediation_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: {
      count: result.items.length,
      total: result.total,
      status: status ?? null,
      severity: severity ?? null
    }
  });

  return res.json({
    count: result.items.length,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    items: result.items
  });
});

/**
 * GET /api/remediation/:id
 */
router.get("/remediation/:id", (req, res) => {
  const ticket = remediationStore.get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: "Remediation ticket not found" });
  }
  return res.json({ item: ticket });
});

/**
 * PATCH /api/remediation/:id
 */
router.patch("/remediation/:id", (req, res, next) => {
  const started = Date.now();
  const parsed = UpdateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    auditTrail.append({
      source: "api:remediation/:id",
      action: "remediation_update",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "validation_error", ticketId: req.params.id }
    });
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const { actor: bodyActor, ...fields } = parsed.data;
  const actor = bodyActor ?? getActorId(req);

  try {
    const updated = remediationStore.update(req.params.id, fields, actor);
    if (!updated) {
      return res.status(404).json({ error: "Remediation ticket not found" });
    }

    auditTrail.append({
      source: "api:remediation/:id",
      action: "remediation_update",
      status: "success",
      durationMs: Date.now() - started,
      metadata: {
        ticketId: updated.id,
        status: updated.status,
        severity: updated.severity
      }
    });

    return res.json({ item: updated });
  } catch (err) {
    auditTrail.append({
      source: "api:remediation/:id",
      action: "remediation_update",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { ticketId: req.params.id }
    });
    return next(err);
  }
});

/**
 * GET /api/remediation/:id/history
 * Per-ticket audit trail.
 */
router.get("/remediation/:id/history", (req, res) => {
  const history = remediationStore.history(req.params.id);
  if (history === undefined) {
    return res.status(404).json({ error: "Remediation ticket not found" });
  }
  return res.json({ count: history.length, items: history });
});

/**
 * POST /api/remediation/from-prioritization
 * Bulk-create tickets from the ranked risk prioritization queue.
 */
router.post("/remediation/from-prioritization", (req, res, next) => {
  const started = Date.now();
  const parsed = FromPrioritizationBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    auditTrail.append({
      source: "api:remediation/from-prioritization",
      action: "remediation_create",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "validation_error" }
    });
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  try {
    const snapshots = governanceCatalog.list();
    const byDataset = new Map(snapshots.map((s) => [s.datasetId, s]));
    const queue = buildRiskPrioritization(snapshots, {
      minLevel: parsed.data.minLevel,
      limit: parsed.data.limit ?? 50
    });
    const { created, skipped } = createTicketsFromPrioritization(queue, byDataset, {
      limit: parsed.data.limit,
      skipExistingForDataset: parsed.data.skipExistingForDataset
    });

    auditTrail.append({
      source: "api:remediation/from-prioritization",
      action: "remediation_create",
      status: "success",
      durationMs: Date.now() - started,
      metadata: { created: created.length, skipped, minLevel: parsed.data.minLevel ?? null }
    });

    return res.status(201).json({ created: created.length, skipped, items: created });
  } catch (err) {
    auditTrail.append({
      source: "api:remediation/from-prioritization",
      action: "remediation_create",
      status: "failure",
      durationMs: Date.now() - started
    });
    return next(err);
  }
});

export default router;
