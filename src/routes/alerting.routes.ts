import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import {
  alertStore,
  runRemediationOverdueCheck,
  type AlertSeverity,
  type AlertStatus,
  type AlertType
} from "../alerting";

const router = Router();

const ALERT_TYPES: AlertType[] = [
  "critical_sensitive_discovery",
  "compliance_violation",
  "failed_scan",
  "high_risk_dataset",
  "remediation_overdue"
];

const SEVERITIES: AlertSeverity[] = ["low", "medium", "high", "critical"];
const STATUSES: AlertStatus[] = ["pending", "queued", "delivered", "suppressed", "failed"];

function parseAlertType(raw: unknown): AlertType | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw);
  return ALERT_TYPES.includes(s as AlertType) ? (s as AlertType) : undefined;
}

function parseSeverity(raw: unknown): AlertSeverity | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  return SEVERITIES.includes(s as AlertSeverity) ? (s as AlertSeverity) : undefined;
}

function parseStatus(raw: unknown): AlertStatus | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  return STATUSES.includes(s as AlertStatus) ? (s as AlertStatus) : undefined;
}

/**
 * GET /api/alerts — list alert events (queue-processed history).
 */
router.get("/alerts", (req, res) => {
  const started = Date.now();
  const type = parseAlertType(req.query.type);
  const severity = parseSeverity(req.query.severity);
  const status = parseStatus(req.query.status);
  const datasetId = req.query.datasetId !== undefined ? String(req.query.datasetId) : undefined;
  const page = z.coerce.number().int().positive().catch(1).parse(req.query.page ?? 1);
  const pageSize = z.coerce.number().int().positive().max(200).catch(25).parse(req.query.pageSize ?? 25);

  const result = alertStore.listAlerts({ type, severity, status, datasetId, page, pageSize });

  auditTrail.append({
    source: "api:alerts",
    action: "alert_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: { count: result.items.length, total: result.total }
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
 * GET /api/alerts/stats — counts by status and type.
 */
router.get("/alerts/stats", (_req, res) => {
  return res.json(alertStore.stats());
});

/**
 * GET /api/alerts/notifications — in-app notifications.
 */
router.get("/alerts/notifications", (req, res) => {
  const unreadOnly = req.query.unreadOnly === "true" || req.query.unreadOnly === "1";
  const type = parseAlertType(req.query.type);
  const page = z.coerce.number().int().positive().catch(1).parse(req.query.page ?? 1);
  const pageSize = z.coerce.number().int().positive().max(200).catch(25).parse(req.query.pageSize ?? 25);

  const result = alertStore.listNotifications({ unreadOnly, type, page, pageSize });
  return res.json({
    count: result.items.length,
    total: result.total,
    unreadCount: result.unreadCount,
    page: result.page,
    pageSize: result.pageSize,
    items: result.items
  });
});

/**
 * PATCH /api/alerts/notifications/:id/read
 */
router.patch("/alerts/notifications/:id/read", (req, res) => {
  const updated = alertStore.markNotificationRead(req.params.id);
  if (!updated) {
    return res.status(404).json({ error: "Notification not found" });
  }
  return res.json({ item: updated });
});

/**
 * POST /api/alerts/notifications/read-all
 */
router.post("/alerts/notifications/read-all", (_req, res) => {
  const marked = alertStore.markAllNotificationsRead();
  return res.json({ marked });
});

/**
 * GET /api/alerts/email-outbox — recent email delivery log (dev / audit).
 */
router.get("/alerts/email-outbox", (req, res) => {
  const limit = z.coerce.number().int().positive().max(200).catch(50).parse(req.query.limit ?? 50);
  return res.json({ count: limit, items: alertStore.listEmailOutbox(limit) });
});

/**
 * POST /api/alerts/evaluate-overdue — manually run remediation overdue check.
 */
router.post("/alerts/evaluate-overdue", (_req, res) => {
  const fired = runRemediationOverdueCheck();
  return res.json({ evaluated: true, alertsTriggered: fired });
});

export default router;
