export type SourceType = "database" | "cloud" | "file" | "api";

export interface SourceMetadata {
  sourceName: string;
  sourceType: SourceType;
  entityName: string;
  fileType?: string;
  fileSizeBytes?: number;
  recordCount?: number;
  owner?: string;
  createdDate?: string;
  modifiedDate?: string;
}

export interface NormalizedRecord {
  [key: string]: unknown;
}

export interface IngestionJob {
  id: string;
  sourceType: SourceType;
  sourceName: string;
  status: "success" | "failed" | "partial";
  attempts: number;
  message: string;
  startedAt: string;
  endedAt: string;
}

export interface S3ObjectSummary {
  key: string;
  sizeBytes?: number;
  lastModified?: string;
  storageClass?: string;
  owner?: string;
}

export interface S3ObjectListPage {
  items: S3ObjectSummary[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}
