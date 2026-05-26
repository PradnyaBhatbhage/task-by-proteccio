import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { deliverEmail } from "./channels/email";
import { deliverInApp } from "./channels/in-app";
import { alertStore } from "./store";
import type { AlertQueueJob, NotificationChannel } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * In-memory FIFO alert delivery queue with background worker.
 */
export class AlertQueue {
  private readonly jobs: AlertQueueJob[] = [];
  private processing = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  enqueue(alertId: string, channels: NotificationChannel[]): AlertQueueJob {
    const job: AlertQueueJob = {
      id: randomUUID(),
      alertId,
      channels,
      enqueuedAt: nowIso(),
      attempts: 0
    };
    this.jobs.push(job);
    return job;
  }

  depth(): number {
    return this.jobs.length;
  }

  startWorker(): void {
    if (this.timer) return;
    const pollMs = env.ALERT_QUEUE_POLL_MS;
    this.timer = setInterval(() => {
      void this.drain();
    }, pollMs);
    logger.info({ pollMs }, "Alert queue worker started");
  }

  stopWorker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async drain(): Promise<number> {
    if (!env.ALERTS_ENABLED || this.processing || this.jobs.length === 0) return 0;
    this.processing = true;
    let delivered = 0;
    try {
      while (this.jobs.length > 0 && env.ALERTS_ENABLED) {
        const job = this.jobs.shift();
        if (!job) break;
        const ok = await this.processJob(job);
        if (ok) delivered += 1;
      }
    } finally {
      this.processing = false;
    }
    return delivered;
  }

  private async processJob(job: AlertQueueJob): Promise<boolean> {
    const alert = alertStore.get(job.alertId);
    if (!alert) return false;

    job.attempts += 1;
    alertStore.markQueued(alert.id);

    let deliveredToAnyChannel = false;
    if (job.channels.includes("email")) {
      deliveredToAnyChannel = (await deliverEmail(alert)) || deliveredToAnyChannel;
    }
    if (job.channels.includes("in_app")) {
      deliverInApp(alert);
      deliveredToAnyChannel = true;
    }

    if (deliveredToAnyChannel) {
      alertStore.markDelivered(alert.id);
      return true;
    }

    if (job.attempts < 3) {
      this.jobs.push(job);
    } else {
      alertStore.markFailed(alert.id);
      logger.error({ alertId: alert.id, jobId: job.id }, "Alert delivery failed after retries");
    }
    return false;
  }

  clear(): void {
    this.jobs.length = 0;
  }
}

export const alertQueue = new AlertQueue();
