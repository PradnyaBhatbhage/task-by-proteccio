import type { ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult } from "../discovery";

export function looksLikeDiscoveryScanResult(v: unknown): v is DiscoveryScanResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.scannedRecords === "number" &&
    Array.isArray(o.findingsPerRecord) &&
    o.trace !== undefined &&
    typeof o.trace === "object"
  );
}

export function looksLikeClassificationScanResult(v: unknown): v is ClassificationScanResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.scannedRecords === "number" && Array.isArray(o.assignmentsPerRecord);
}
