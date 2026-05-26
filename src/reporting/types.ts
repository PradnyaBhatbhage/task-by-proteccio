/** Supported audit-ready report templates. */
export type ReportType =
  | "privacy_risk"
  | "compliance"
  | "source_discovery"
  | "classification_summary"
  | "remediation"
  | "executive_summary";

export type ExportFormat = "json" | "csv" | "pdf";

export interface ReportSection {
  id: string;
  title: string;
  description?: string;
  /** Safe structured rows or key-value metrics (no raw PII). */
  data: unknown;
}

export interface ReportContent {
  reportType: ReportType;
  title: string;
  generatedAt: string;
  summary: string;
  sections: ReportSection[];
  metadata: {
    datasetsInCatalog: number;
    totalScannedRecords: number;
    totalSensitiveRecords: number;
    generatedBy?: string;
  };
}

export interface ReportRecord {
  id: string;
  reportType: ReportType;
  title: string;
  /** ISO timestamp when the report was generated. */
  generatedAt: string;
  /** Primary format requested at generation time. */
  primaryFormat: ExportFormat;
  summary: string;
  tags: string[];
  generatedBy?: string;
  content: ReportContent;
  /** Suggested download filename (without extension). */
  fileBaseName: string;
}

export interface GenerateReportInput {
  reportType: ReportType;
  format: ExportFormat;
  generatedBy?: string;
  tags?: string[];
}

export interface ReportQuery {
  q?: string;
  reportType?: ReportType;
  format?: ExportFormat;
  generatedFrom?: string;
  generatedTo?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportTypeInfo {
  id: ReportType;
  title: string;
  description: string;
}

export const REPORT_TYPES: ReportTypeInfo[] = [
  {
    id: "privacy_risk",
    title: "Privacy Risk Report",
    description: "Risk distribution, high-risk datasets, prioritization queue, and factor rollups."
  },
  {
    id: "compliance",
    title: "Compliance Report",
    description: "Regulatory exposure, violated/missing controls, and compliance status by dataset."
  },
  {
    id: "source_discovery",
    title: "Source-wise Discovery Report",
    description: "Per-source discovery totals, scanned records, and detection category breakdown."
  },
  {
    id: "classification_summary",
    title: "Classification Summary Report",
    description: "Privacy label distribution across catalog and mapped fields."
  },
  {
    id: "remediation",
    title: "Remediation Report",
    description: "Remediation ticket status, severity breakdown, and open vs resolved metrics."
  },
  {
    id: "executive_summary",
    title: "Executive Summary Report",
    description: "Consolidated governance KPIs for leadership review."
  }
];

export const EXPORT_FORMATS: ExportFormat[] = ["json", "csv", "pdf"];

export type ReportJobStatus = "pending" | "processing" | "completed" | "failed";

export interface ReportJobExport {
  format: ExportFormat;
  contentType: string;
  fileName: string;
  body: string | Buffer;
}

export interface ReportJob {
  id: string;
  input: GenerateReportInput;
  status: ReportJobStatus;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
  recordId?: string;
  error?: string;
  attempts: number;
  export?: ReportJobExport;
}
