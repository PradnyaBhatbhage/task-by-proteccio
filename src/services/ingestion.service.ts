import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { IngestionJob } from "../types";
import { logger } from "../utils/logger";
import { evaluateFailedScan } from "../alerting";

const ingestionHistory: IngestionJob[] = [];

export async function runIngestionJob(
  sourceType: IngestionJob["sourceType"],
  sourceName: string,
  task: () => Promise<void>
): Promise<IngestionJob> {
  const startedAt = new Date();
  const job: IngestionJob = {
    id: randomUUID(),
    sourceType,
    sourceName,
    status: "success",
    attempts: 0,
    message: "Completed",
    startedAt: startedAt.toISOString(),
    endedAt: startedAt.toISOString()
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      job.attempts = attempt;
      await task();
      job.status = "success";
      job.message = "Completed";
      break;
    } catch (err) {
      lastError = err;
      job.status = "failed";
      job.message = err instanceof Error ? err.message : "Unknown ingestion error";
      logger.error({ err, attempt, sourceType, sourceName }, "Ingestion attempt failed");
    }
  }

  if (lastError) {
    logger.error({ sourceType, sourceName, lastError }, "Ingestion job failed after retries");
    evaluateFailedScan({
      subjectKey: `ingestion:${job.id}`,
      source: `${sourceType}:${sourceName}`,
      errorMessage: job.message,
      scanKind: "ingestion"
    });
  } else {
    logger.info({ sourceType, sourceName }, "Ingestion job completed");
  }

  job.endedAt = new Date().toISOString();
  ingestionHistory.unshift(job);
  return job;
}

export function getIngestionHistory(): IngestionJob[] {
  return ingestionHistory;
}

export function startScheduler(task: () => Promise<void>): void {
  cron.schedule(env.INGESTION_CRON, async () => {
    await runIngestionJob("api", "scheduled-default", task);
  });
}
