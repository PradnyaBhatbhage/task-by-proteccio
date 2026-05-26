import { timingSafeEqual } from "node:crypto";

/** Maximum rows returned in ingestion previews / samples. */
export const MAX_PREVIEW_ROWS = 50;

/** Maximum DB preview `limit` parameter. */
export const MAX_DB_PREVIEW_LIMIT = 100;

/** Maximum records per full ingestion job (when `maxRecords` is set). */
export const MAX_INGEST_RECORDS = 10_000;

/** Maximum records per discovery scan request body. */
export const MAX_DISCOVERY_RECORDS = 50_000;

/**
 * Constant-time comparison for API keys (length must match).
 */
export function secureCompareSecret(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function clampPreviewRows(count: number, fallback = 20): number {
  if (!Number.isFinite(count)) return Math.min(fallback, MAX_PREVIEW_ROWS);
  return Math.min(MAX_PREVIEW_ROWS, Math.max(1, Math.floor(count)));
}

export function clampDbPreviewLimit(count: number, fallback = 50): number {
  if (!Number.isFinite(count)) return Math.min(fallback, MAX_DB_PREVIEW_LIMIT);
  return Math.min(MAX_DB_PREVIEW_LIMIT, Math.max(1, Math.floor(count)));
}

export function clampIngestMaxRecords(count: number | undefined): number | undefined {
  if (count === undefined || !Number.isFinite(count)) return undefined;
  return Math.min(MAX_INGEST_RECORDS, Math.max(1, Math.floor(count)));
}

export function clampDiscoveryRecords(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.min(MAX_DISCOVERY_RECORDS, Math.max(0, Math.floor(count)));
}
