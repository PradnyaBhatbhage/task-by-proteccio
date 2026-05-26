import cron from "node-cron";
import { env } from "../config/env";
import { remediationStore } from "../remediation/store";
import { logger } from "../utils/logger";
import { evaluateRemediationOverdue } from "./triggers";

function daysBetween(isoDate: string, now = Date.now()): number {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

/**
 * Scan open/in-progress remediation tickets and alert when past overdue threshold.
 */
export function runRemediationOverdueCheck(): number {
  if (!env.ALERTS_ENABLED) return 0;

  const thresholdDays = env.ALERT_REMEDIATION_OVERDUE_DAYS;
  let fired = 0;

  for (const ticket of remediationStore.list()) {
    if (ticket.status !== "open" && ticket.status !== "in_progress") continue;
    const ageDays = daysBetween(ticket.updatedAt);
    if (ageDays < thresholdDays) continue;
    evaluateRemediationOverdue(ticket, ageDays);
    fired += 1;
  }

  if (fired > 0) {
    logger.info({ fired, thresholdDays }, "Remediation overdue alerts evaluated");
  }
  return fired;
}

/** Daily cron for overdue remediation checks. */
export function startAlertScheduler(): void {
  if (!env.ALERTS_ENABLED) return;

  cron.schedule("0 8 * * *", () => {
    runRemediationOverdueCheck();
  });

  logger.info(
    { overdueDays: env.ALERT_REMEDIATION_OVERDUE_DAYS },
    "Alert scheduler started (remediation overdue daily 08:00)"
  );
}
