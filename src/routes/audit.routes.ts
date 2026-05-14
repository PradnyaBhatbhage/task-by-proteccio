import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import type { AuditAction, AuditStatus } from "../audit/types";

const router = Router();

const ACTIONS: AuditAction[] = [
  "discovery_scan",
  "classification",
  "profiling",
  "mapping_ingest",
  "catalog_upsert",
  "search_query",
  "dashboard_query",
  "api_failure",
  "scan_failed"
];

const STATUSES: AuditStatus[] = ["success", "failure", "partial"];

function parseAuditAction(raw: unknown): AuditAction | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw);
  return ACTIONS.includes(s as AuditAction) ? (s as AuditAction) : undefined;
}

function parseAuditStatus(raw: unknown): AuditStatus | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw);
  return STATUSES.includes(s as AuditStatus) ? (s as AuditStatus) : undefined;
}

/**
 * GET /api/audit/logs?limit=&action=&status=&sourcePrefix=
 * Returns recent audit entries (safe fields only; no sensitive payloads).
 */
router.get("/audit/logs", (req, res) => {
  const limitRaw = req.query.limit !== undefined ? Number(req.query.limit) : 200;
  const limit = z.number().int().positive().max(500).safeParse(limitRaw).success ? limitRaw : 200;

  const action = parseAuditAction(req.query.action);
  const status = parseAuditStatus(req.query.status);
  const sourcePrefix = req.query.sourcePrefix !== undefined ? String(req.query.sourcePrefix) : undefined;

  const items = auditTrail.filter({
    action,
    status,
    sourcePrefix,
    limit
  });

  return res.json({ count: items.length, items });
});

export default router;
