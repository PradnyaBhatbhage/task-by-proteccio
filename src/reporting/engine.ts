import { governanceCatalog } from "../catalog";
import { env } from "../config/env";
import type { ExportFormat, GenerateReportInput, ReportContent, ReportJob, ReportRecord } from "./types";
import { exportReport, fileExtension } from "./exporters";
import { reportQueue, shouldUseAsyncReport } from "./queue";
import { reportStore } from "./store";

export interface GeneratedReportResult {
  record: ReportRecord;
  download: {
    format: ExportFormat;
    contentType: string;
    fileName: string;
    body: string | Buffer;
  };
}

/**
 * Generates a timestamped report, stores it in searchable history, and returns export payload.
 */
export async function generateReport(input: GenerateReportInput): Promise<GeneratedReportResult> {
  const record = reportStore.generate(input);
  const { body, contentType } = await exportReport(record.content, input.format);

  return {
    record,
    download: {
      format: input.format,
      contentType,
      fileName: `${record.fileBaseName}.${fileExtension(input.format)}`,
      body
    }
  };
}

/**
 * Enqueues report generation for background processing (returns immediately).
 */
export function enqueueReportGeneration(input: GenerateReportInput, asyncRequested?: boolean): ReportJob | null {
  if (!shouldUseAsyncReport(asyncRequested)) return null;
  return reportQueue.enqueue(input);
}

export function startReportWorker(): void {
  reportQueue.startWorker();
}

export function stopReportWorker(): void {
  reportQueue.stopWorker();
}

export async function downloadReport(
  record: ReportRecord,
  format: ExportFormat
): Promise<{ body: string | Buffer; contentType: string; fileName: string }> {
  const { body, contentType } = await exportReport(record.content, format);
  return {
    body,
    contentType,
    fileName: `${record.fileBaseName}.${fileExtension(format)}`
  };
}

export function getReportContent(record: ReportRecord): ReportContent {
  return record.content;
}

/** Whether catalog size warrants async report generation by default. */
export function catalogExceedsAsyncThreshold(): boolean {
  return governanceCatalog.size >= env.ASYNC_REPORT_THRESHOLD_DATASETS;
}
