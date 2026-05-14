export type AuditAction =
  | "discovery_scan"
  | "classification"
  | "profiling"
  | "mapping_ingest"
  | "catalog_upsert"
  | "search_query"
  | "dashboard_query"
  | "api_failure"
  | "scan_failed";

export type AuditStatus = "success" | "failure" | "partial";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  /** Logical source name or route group (no PII). */
  source: string;
  action: AuditAction;
  status: AuditStatus;
  durationMs: number;
  /** Safe metadata only: counts, ids, categories — never raw field values. */
  metadata?: Record<string, unknown>;
}
