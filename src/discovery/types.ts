/**
 * Sensitive data taxonomy and discovery result shapes for the privacy discovery engine.
 */

export type SourceType = "database" | "cloud" | "file" | "api";

/** High-level categories aligned with enterprise privacy inventories. */
export type SensitiveCategory =
  | "email"
  | "phone"
  | "aadhaar"
  | "pan"
  | "passport"
  | "ip_address"
  | "payment_card"
  | "bank_account"
  | "person_name"
  | "address"
  | "date_of_birth"
  | "authentication_field";

export type DetectionMethod = "regex" | "rule_validation" | "keyword" | "pattern";

export type Confidence = "high" | "medium" | "low";

/** Identifies where in the source the value was found (traceability). */
export interface SourceTrace {
  sourceType: SourceType;
  /** Logical source instance, e.g. bucket name, DB host alias, API base URL. */
  sourceName: string;
  /** Entity within the source: table name, object key, filename. */
  entityName: string;
  /** Zero-based index within the scanned batch/array. */
  recordIndex: number;
}

/**
 * One sensitive finding. Multiple findings per record/path are allowed
 * (e.g. email regex + keyword reinforcement).
 */
export interface DiscoveryFinding {
  category: SensitiveCategory;
  methods: DetectionMethod[];
  /** JSON-path style location within the record (supports arrays as [n]). */
  path: string;
  confidence: Confidence;
  /** Masked representation safe for logs/UI (never full PAN/Aadhaar). */
  maskedSample?: string;
  /** Character length of the matched segment (not the masked form). */
  valueLength?: number;
}

export interface DiscoveryScanRecordResult {
  recordIndex: number;
  findings: DiscoveryFinding[];
}

export interface DiscoveryScanResult {
  trace: Omit<SourceTrace, "recordIndex">;
  scannedRecords: number;
  findingsPerRecord: DiscoveryScanRecordResult[];
  summary: Partial<Record<SensitiveCategory, number>>;
}

export interface DiscoveryScanOptions {
  /** Max JSON nesting depth when flattening objects (default 32). */
  maxDepth?: number;
  /** Max leaves extracted per record (default 50_000). */
  maxLeavesPerRecord?: number;
}
