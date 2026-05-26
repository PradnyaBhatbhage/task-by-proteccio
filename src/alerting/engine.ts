import { env } from "../config/env";
import { logger } from "../utils/logger";
import { alertDedupe } from "./dedupe";
import { alertQueue } from "./queue";
import { alertStore } from "./store";
import type { EnqueueAlertInput, NotificationChannel } from "./types";

function defaultChannels(): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (env.ALERT_EMAIL_TO || env.ALERT_WEBHOOK_URL) channels.push("email");
  if (env.ALERT_IN_APP_ENABLED) channels.push("in_app");
  if (channels.length === 0) channels.push("email");
  return channels;
}

/**
 * Enqueue a new alert if not deduplicated; returns alert id or null when suppressed.
 */
export function enqueueAlert(input: EnqueueAlertInput): string | null {
  if (!env.ALERTS_ENABLED) return null;

  const dedupeKey = alertDedupe.buildKey(input.type, input.subjectKey);
  if (alertDedupe.shouldSuppress(dedupeKey)) {
    logger.debug({ dedupeKey, type: input.type }, "Alert suppressed (duplicate)");
    const suppressed = alertStore.createPending(input, dedupeKey, []);
    alertStore.markSuppressed(suppressed.id);
    return null;
  }

  const channels = input.channels ?? defaultChannels();
  const alert = alertStore.createPending(input, dedupeKey, channels);
  alertDedupe.record(dedupeKey, alert.id);
  alertQueue.enqueue(alert.id, channels);

  logger.info(
    { alertId: alert.id, type: alert.type, severity: alert.severity, subjectKey: input.subjectKey },
    "Alert enqueued"
  );
  return alert.id;
}

export function startAlertWorker(): void {
  if (!env.ALERTS_ENABLED) {
    logger.info("Alerting disabled (ALERTS_ENABLED=false)");
    return;
  }
  alertQueue.startWorker();
}

export function stopAlertWorker(): void {
  alertQueue.stopWorker();
}
