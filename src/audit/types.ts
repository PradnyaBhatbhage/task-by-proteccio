export type AuditAction =
  | "discovery_scan"
  | "classification"
  | "profiling"
  | "risk_analysis"
  | "compliance_intelligence"
  | "risk_query"
  | "mapping_ingest"
  | "catalog_upsert"
  | "search_query"
  | "dashboard_query"
  | "remediation_create"
  | "remediation_update"
  | "remediation_query"
  | "report_generate"
  | "report_query"
  | "auth_login"
  | "auth_signup"
  | "password_reset_requested"
  | "user_manage"
  | "source_create"
  | "source_update"
  | "workflow_run"
  | "api_failure"
  | "scan_failed"
  | "alert_query"
  | "alert_delivery";

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
