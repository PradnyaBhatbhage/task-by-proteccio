import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import type { AlertEvent } from "../types";
import { alertStore } from "../store";

function parseRecipients(): string[] {
  const raw = env.ALERT_EMAIL_TO?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatEmailBody(alert: AlertEvent): string {
  const lines = [
    `Alert: ${alert.title}`,
    `Type: ${alert.type}`,
    `Severity: ${alert.severity}`,
    "",
    alert.message,
    "",
    `Subject: ${alert.subjectKey}`,
    alert.datasetId ? `Dataset: ${alert.datasetId}` : null,
    alert.source ? `Source: ${alert.source}` : null,
    `Time: ${alert.createdAt}`,
    "",
    "Metadata:",
    ...Object.entries(alert.metadata).map(([k, v]) => `  ${k}: ${String(v)}`)
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

/**
 * Basic email delivery — logs and records outbox; optional webhook POST when configured.
 */
export async function deliverEmail(alert: AlertEvent): Promise<boolean> {
  const to = parseRecipients();
  const subject = `[${alert.severity.toUpperCase()}] ${alert.title}`;
  const body = formatEmailBody(alert);

  if (to.length === 0) {
    logger.warn(
      { alertId: alert.id, type: alert.type },
      "Alert email skipped (ALERT_EMAIL_TO not configured)"
    );
    alertStore.pushEmailOutbox({
      alertId: alert.id,
      to: ["(not configured)"],
      subject,
      body,
      sent: false,
      error: "ALERT_EMAIL_TO not set"
    });
    return false;
  }

  const webhook = env.ALERT_WEBHOOK_URL?.trim();
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "email",
          to,
          from: env.ALERT_EMAIL_FROM,
          subject,
          body,
          alert: {
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            subjectKey: alert.subjectKey,
            datasetId: alert.datasetId ?? null
          }
        })
      });
      if (!res.ok) {
        throw new Error(`Webhook returned ${res.status}`);
      }
      alertStore.pushEmailOutbox({ alertId: alert.id, to, subject, body, sent: true });
      logger.info({ alertId: alert.id, to, subject }, "Alert email delivered via webhook");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Webhook failed";
      alertStore.pushEmailOutbox({ alertId: alert.id, to, subject, body, sent: false, error: msg });
      logger.error({ err, alertId: alert.id }, "Alert email webhook failed");
      return false;
    }
  }

  logger.info({ alertId: alert.id, to, subject, bodyLength: body.length }, "Alert email (log delivery)");
  alertStore.pushEmailOutbox({ alertId: alert.id, to, subject, body, sent: true });
  return true;
}
