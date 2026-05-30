import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import type { ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult } from "../discovery";
import type { GovernanceDatasetSnapshot } from "../catalog/types";
import { getSupabaseAdmin, isSupabaseConfigured, publishPlatformEvent } from "./client";

export interface SupabasePersistenceResult {
  enabled: boolean;
  ok: boolean;
  table?: string;
  id?: string;
  error?: string;
}

function sensitiveRecordCount(discovery: DiscoveryScanResult): number {
  return discovery.findingsPerRecord.filter((record) => record.findings.length > 0).length;
}

export async function persistDiscoveryRun(input: {
  discovery: DiscoveryScanResult;
  classification?: ClassificationScanResult;
  catalogSnapshot?: GovernanceDatasetSnapshot;
  actorId?: string;
  sourceId?: string;
}): Promise<SupabasePersistenceResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { enabled: false, ok: true, table: env.SUPABASE_DISCOVERY_TABLE };

  const id = randomUUID();
  const { discovery, classification, catalogSnapshot } = input;
  const sensitiveRecords = catalogSnapshot?.sensitiveRecordCount ?? sensitiveRecordCount(discovery);
  const { error } = await admin.from(env.SUPABASE_DISCOVERY_TABLE).insert({
    id,
    source_id: input.sourceId ?? null,
    dataset_id: catalogSnapshot?.datasetId ?? null,
    system_id: catalogSnapshot?.systemId ?? null,
    source_type: discovery.trace.sourceType,
    source_name: discovery.trace.sourceName,
    entity_name: discovery.trace.entityName,
    scanned_records: discovery.scannedRecords,
    sensitive_records: sensitiveRecords,
    discovery_summary: discovery.summary,
    classification_summary: classification?.summary ?? {},
    discovery_result: discovery,
    classification_result: classification ?? null,
    profile: catalogSnapshot?.profile ?? null,
    risk: catalogSnapshot?.risk ?? null,
    created_by: input.actorId ?? null
  });

  if (error) {
    return { enabled: true, ok: false, table: env.SUPABASE_DISCOVERY_TABLE, id, error: error.message };
  }

  void publishPlatformEvent("discovery.persisted", {
    runId: id,
    datasetId: catalogSnapshot?.datasetId,
    sourceName: discovery.trace.sourceName,
    scannedRecords: discovery.scannedRecords,
    sensitiveRecords
  });
  return { enabled: true, ok: true, table: env.SUPABASE_DISCOVERY_TABLE, id };
}

export async function uploadFileToSupabase(input: {
  filePath: string;
  originalName: string;
  mimeType?: string;
  sizeBytes?: number;
  actorId?: string;
  metadata?: Record<string, unknown>;
}): Promise<SupabasePersistenceResult & { bucket?: string; objectPath?: string }> {
  const admin = getSupabaseAdmin();
  if (!admin || !isSupabaseConfigured()) {
    return { enabled: false, ok: true, table: env.SUPABASE_FILE_TABLE };
  }

  const id = randomUUID();
  const safeName = path.basename(input.originalName).replace(/[^a-zA-Z0-9._-]+/g, "_");
  const objectPath = `${new Date().toISOString().slice(0, 10)}/${id}-${safeName}`;
  const fileBody = await readFile(input.filePath);
  const upload = await admin.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(objectPath, fileBody, {
    contentType: input.mimeType || "application/octet-stream",
    upsert: false
  });
  if (upload.error) {
    return { enabled: true, ok: false, id, bucket: env.SUPABASE_STORAGE_BUCKET, objectPath, error: upload.error.message };
  }

  const { error } = await admin.from(env.SUPABASE_FILE_TABLE).insert({
    id,
    bucket: env.SUPABASE_STORAGE_BUCKET,
    object_path: objectPath,
    original_name: input.originalName,
    mime_type: input.mimeType ?? null,
    size_bytes: input.sizeBytes ?? null,
    metadata: input.metadata ?? {},
    uploaded_by: input.actorId ?? null
  });
  if (error) {
    return { enabled: true, ok: false, table: env.SUPABASE_FILE_TABLE, id, bucket: env.SUPABASE_STORAGE_BUCKET, objectPath, error: error.message };
  }

  void publishPlatformEvent("file.uploaded", {
    fileId: id,
    bucket: env.SUPABASE_STORAGE_BUCKET,
    objectPath,
    originalName: input.originalName
  });
  return { enabled: true, ok: true, table: env.SUPABASE_FILE_TABLE, id, bucket: env.SUPABASE_STORAGE_BUCKET, objectPath };
}
