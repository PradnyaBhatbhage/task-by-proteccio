import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { buildReportContent } from "./builders";
import { exportReport, fileExtension } from "./exporters";
import { governanceCatalog } from "../catalog";
import { reportStore } from "./store";
import type { ExportFormat, GenerateReportInput, ReportJob, ReportJobStatus } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * In-memory FIFO report generation queue with background worker.
 * Offloads heavy report builds from the HTTP thread to prevent API bottlenecks.
 */
export class ReportQueue {
  private readonly jobs = new Map<string, ReportJob>();
  private readonly pending: string[] = [];
  private processing = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  enqueue(input: GenerateReportInput): ReportJob {
    const job: ReportJob = {
      id: randomUUID(),
      input,
      status: "pending",
      enqueuedAt: nowIso(),
      attempts: 0
    };
    this.jobs.set(job.id, job);
    this.pending.push(job.id);
    return job;
  }

  get(jobId: string): ReportJob | undefined {
    return this.jobs.get(jobId);
  }

  depth(): number {
    return this.pending.length;
  }

  startWorker(): void {
    if (this.timer) return;
    const pollMs = env.REPORT_QUEUE_POLL_MS;
    this.timer = setInterval(() => {
      void this.drain();
    }, pollMs);
    logger.info({ pollMs }, "Report queue worker started");
  }

  stopWorker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async drain(): Promise<number> {
    if (this.processing || this.pending.length === 0) return 0;
    this.processing = true;
    let completed = 0;
    try {
      while (this.pending.length > 0) {
        const jobId = this.pending.shift();
        if (!jobId) break;
        const ok = await this.processJob(jobId);
        if (ok) completed += 1;
      }
    } finally {
      this.processing = false;
    }
    return completed;
  }

  private async processJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status === "completed" || job.status === "failed") return false;

    job.attempts += 1;
    job.status = "processing";
    job.startedAt = nowIso();

    try {
      const content = buildReportContent(job.input.reportType, { generatedBy: job.input.generatedBy });
      const record = reportStore.generate(job.input, content);
      const { body, contentType } = await exportReport(record.content, job.input.format);

      job.status = "completed";
      job.recordId = record.id;
      job.completedAt = nowIso();
      job.export = {
        format: job.input.format,
        contentType,
        fileName: `${record.fileBaseName}.${fileExtension(job.input.format)}`,
        body
      };
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Report generation failed";
      if (job.attempts < 2) {
        job.status = "pending";
        this.pending.push(jobId);
      } else {
        job.status = "failed";
        job.error = message;
        job.completedAt = nowIso();
        logger.error({ jobId, err }, "Report job failed");
      }
      return false;
    }
  }

  clear(): void {
    this.jobs.clear();
    this.pending.length = 0;
  }
}

export const reportQueue = new ReportQueue();

export function shouldUseAsyncReport(asyncRequested?: boolean): boolean {
  if (asyncRequested === true) return true;
  return governanceCatalog.size >= env.ASYNC_REPORT_THRESHOLD_DATASETS;
}
