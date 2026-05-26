/** Max records accepted in a single discovery scan request. */
export const MAX_DISCOVERY_RECORDS = 50_000;

/** Default TTL for dashboard aggregate cache (ms). */
export const DEFAULT_DASHBOARD_CACHE_TTL_MS = 30_000;

/** Max per-dataset compliance rows embedded in compliance reports. */
export const DEFAULT_REPORT_COMPLIANCE_ROWS = 500;

/** Max remediation tickets embedded in remediation reports. */
export const DEFAULT_REPORT_REMEDIATION_TICKETS = 500;

/** Catalog dataset count above which report generation defaults to async. */
export const DEFAULT_ASYNC_REPORT_THRESHOLD = 100;
