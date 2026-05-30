export type SourceConnectorType = "postgres" | "mysql" | "mongodb" | "api" | "s3" | "file";

export type SourceStatus = "draft" | "configured" | "connected" | "scanning" | "failed" | "disabled";

export interface SourceConnectionSummary {
  host?: string;
  port?: number;
  database?: string;
  url?: string;
  bucket?: string;
  prefix?: string;
  fileName?: string;
  authMode?: "none" | "api_key" | "basic" | "bearer" | "credentials" | "iam" | "secret_ref";
  secretRef?: string;
}

export interface ManagedSource {
  id: string;
  name: string;
  type: SourceConnectorType;
  owner?: string;
  environment: "development" | "staging" | "production" | "sandbox";
  status: SourceStatus;
  connection: SourceConnectionSummary;
  tags: string[];
  lastCheckedAt?: string;
  lastScanAt?: string;
  createdAt: string;
  updatedAt: string;
  supabaseSync?: {
    enabled: boolean;
    ok: boolean;
    error?: string;
  };
}
