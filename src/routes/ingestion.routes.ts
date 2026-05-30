import { Router } from "express";
import path from "node:path";
import { PostgresConnector } from "../connectors/postgres.connector";
import { S3Connector } from "../connectors/s3.connector";
import { ingestFromApi } from "../connectors/api.connector";
import { runBasicMalwareScan, uploadMiddleware } from "../services/upload.service";
import { buildMetadata } from "../services/metadata";
import { normalizeRecords } from "../services/normalizer";
import { getIngestionHistory, runIngestionJob } from "../services/ingestion.service";
import { ingestS3ObjectBatches, parseS3ObjectPreview } from "../services/s3-parse.service";
import { parseUploadedFilePreview } from "../services/file-parse.service";
import { MySQLConnector } from "../connectors/mysql.connector";
import { MongoDBConnector } from "../connectors/mongodb.connector";
import { assertSafeIdentifier } from "../utils/identifiers";
import { scanRecords } from "../discovery";
import { maskRecordsForPreview } from "../discovery/mask";
import { clampDbPreviewLimit, clampIngestMaxRecords, clampPreviewRows } from "../utils/security";
import { getActorId } from "../middleware/authenticate";
import { uploadFileToSupabase } from "../supabase/persistence";

function includeDiscoveryFromBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const d = (body as Record<string, unknown>).discovery;
  return d === true || d === "true" || d === 1 || d === "1";
}

/** Never return raw sensitive field values in API previews. */
function previewSample(
  records: Record<string, unknown>[],
  rowCount: number
): Record<string, unknown>[] {
  return maskRecordsForPreview(records.slice(0, clampPreviewRows(rowCount)));
}

const router = Router();

function safeUploadName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "_").slice(0, 180);
  return base || "uploaded-file";
}

router.get("/db/postgres/health", async (_req, res, next) => {
  try {
    const connector = new PostgresConnector();
    const ok = await connector.validateConnection();
    res.json({ ok });
  } catch (err) {
    next(err);
  }
});

router.get("/db/postgres/schema", async (_req, res, next) => {
  try {
    const connector = new PostgresConnector();
    const tables = await connector.listTables();
    const schema = await Promise.all(
      tables.map(async (table) => ({
        table,
        columns: await connector.getColumns(table)
      }))
    );
    res.json({ schema });
  } catch (err) {
    next(err);
  }
});

router.get("/db/mysql/health", async (_req, res, next) => {
  try {
    const connector = new MySQLConnector();
    const ok = await connector.validateConnection();
    res.json({ ok });
  } catch (err) {
    next(err);
  }
});

router.get("/db/mysql/schema", async (_req, res, next) => {
  try {
    const connector = new MySQLConnector();
    const tables = await connector.listTables();
    const schema = await Promise.all(
      tables.map(async (table) => ({
        table,
        columns: await connector.getColumns(table)
      }))
    );
    res.json({ schema });
  } catch (err) {
    next(err);
  }
});

router.get("/db/mongodb/health", async (_req, res, next) => {
  try {
    const connector = new MongoDBConnector();
    const ok = await connector.validateConnection();
    res.json({ ok });
  } catch (err) {
    next(err);
  }
});

router.get("/db/mongodb/schema", async (_req, res, next) => {
  try {
    const connector = new MongoDBConnector();
    const collections = await connector.listCollections();
    const schema = await Promise.all(
      collections.map(async (collection) => ({
        collection,
        fields: await connector.getFieldsAndTypes(collection, 100)
      }))
    );
    res.json({ schema });
  } catch (err) {
    next(err);
  }
});

router.get("/s3/buckets", async (_req, res, next) => {
  try {
    const connector = new S3Connector();
    const buckets = await connector.listBuckets();
    res.json({ buckets });
  } catch (err) {
    next(err);
  }
});

router.get("/s3/files", async (req, res, next) => {
  try {
    const bucket = String(req.query.bucket ?? "");
    const prefix = String(req.query.prefix ?? "");
    const continuationToken =
      req.query.continuationToken ? String(req.query.continuationToken) : undefined;
    const maxKeysRaw = req.query.maxKeys ? Number(req.query.maxKeys) : 1000;
    const maxKeys = Number.isFinite(maxKeysRaw) ? Math.min(Math.max(1, maxKeysRaw), 1000) : 1000;
    const connector = new S3Connector();
    const page = await connector.listFilesPage(bucket, prefix, continuationToken, maxKeys);
    res.json({ bucket, prefix, ...page });
  } catch (err) {
    next(err);
  }
});

router.get("/s3/object/metadata", async (req, res, next) => {
  try {
    const bucket = String(req.query.bucket ?? "");
    const key = String(req.query.key ?? "");
    if (!bucket || !key) {
      return res.status(400).json({ error: "Query parameters 'bucket' and 'key' are required." });
    }

    const connector = new S3Connector();
    const metadata = await connector.getObjectMetadata(bucket, key);
    res.json({ metadata });
  } catch (err) {
    next(err);
  }
});

router.post("/upload", uploadMiddleware.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }
    await runBasicMalwareScan(req.file.path);
    const metadata = buildMetadata({
      sourceName: "internal-upload",
      sourceType: "file",
      entityName: safeUploadName(req.file.originalname),
      fileType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      createdDate: new Date()
    });
    const supabase = await uploadFileToSupabase({
      filePath: req.file.path,
      originalName: safeUploadName(req.file.originalname),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      actorId: getActorId(req),
      metadata: metadata as unknown as Record<string, unknown>
    });
    res.status(201).json({ fileId: req.file.filename, metadata, supabase });
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/api", async (req, res, next) => {
  try {
    const job = await runIngestionJob("api", String(req.body.url ?? "api"), async () => {
      const records = (await ingestFromApi(req.body)) as Record<string, unknown>[];
      const schemaMapping =
        req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;
      const normalized = normalizeRecords(records, { schemaMapping });
      const metadata = buildMetadata({
        sourceName: req.body.url,
        sourceType: "api",
        entityName: "api-response",
        recordCount: normalized.length,
        createdDate: new Date()
      });
      const payload: Record<string, unknown> = {
        recordCount: normalized.length,
        metadata,
        sample: previewSample(normalized, 5)
      };
      if (includeDiscoveryFromBody(req.body)) {
        payload.discovery = scanRecords(normalized, {
          sourceType: "api",
          sourceName: String(req.body.url ?? "api"),
          entityName: "api-response"
        });
      }
      res.json(payload);
    });
    if (job.status !== "success") {
      return res.status(500).json(job);
    }
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/file/preview", uploadMiddleware.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    await runBasicMalwareScan(req.file.path);
    const maxRecordsRaw = req.body.maxRecords ? Number(req.body.maxRecords) : 20;
    const maxRecords = clampPreviewRows(Number.isFinite(maxRecordsRaw) ? maxRecordsRaw : 20);
    const schemaMapping =
      req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;

    const parsed = await parseUploadedFilePreview({
      filePath: req.file.path,
      originalName: safeUploadName(req.file.originalname),
      maxRecords
    });
    const normalized = normalizeRecords(parsed.records, { schemaMapping });
    const metadata = buildMetadata({
      sourceName: "internal-upload",
      sourceType: "file",
      entityName: safeUploadName(req.file.originalname),
      fileType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      recordCount: normalized.length,
      createdDate: new Date()
    });

    const body = req.body as Record<string, unknown>;
    const out: Record<string, unknown> = {
      fileId: req.file.filename,
      parser: parsed.parser,
      warnings: parsed.warnings,
      metadata,
      preview: previewSample(normalized, 20)
    };
    out.supabase = await uploadFileToSupabase({
      filePath: req.file.path,
      originalName: safeUploadName(req.file.originalname),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      actorId: getActorId(req),
      metadata: metadata as unknown as Record<string, unknown>
    });
    if (includeDiscoveryFromBody(body)) {
      out.discovery = scanRecords(normalized, {
        sourceType: "file",
        sourceName: "internal-upload",
        entityName: safeUploadName(req.file.originalname)
      });
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/s3/preview", async (req, res, next) => {
  try {
    const bucket = String(req.body.bucket ?? "");
    const key = String(req.body.key ?? "");
    const maxRecordsInput = req.body.maxRecords !== undefined ? Number(req.body.maxRecords) : undefined;
    const maxRecords = clampIngestMaxRecords(maxRecordsInput);

    if (!bucket || !key) {
      return res.status(400).json({ error: "Body parameters 'bucket' and 'key' are required." });
    }

    const job = await runIngestionJob("cloud", `${bucket}/${key}`, async () => {
      const parsed = await parseS3ObjectPreview({ bucket, key, maxRecords });
      const schemaMapping =
        req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;
      const normalized = normalizeRecords(parsed.records, { schemaMapping });
      const metadata = buildMetadata({
        sourceName: bucket,
        sourceType: "cloud",
        entityName: key,
        fileType: String(parsed.metadata.contentType ?? ""),
        fileSizeBytes:
          typeof parsed.metadata.contentLength === "number" ? parsed.metadata.contentLength : undefined,
        recordCount: normalized.length,
        modifiedDate: parsed.metadata.lastModified
          ? new Date(String(parsed.metadata.lastModified))
          : undefined
      });

      const payload: Record<string, unknown> = {
        parser: parsed.parser,
        recordCount: normalized.length,
        metadata,
        sample: previewSample(normalized, 20)
      };
      if (includeDiscoveryFromBody(req.body)) {
        payload.discovery = scanRecords(normalized, {
          sourceType: "cloud",
          sourceName: bucket,
          entityName: key
        });
      }
      res.json(payload);
    });
    if (job.status !== "success") {
      return res.status(500).json(job);
    }
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/postgres/table/preview", async (req, res, next) => {
  try {
    const tableName = String(req.body.tableName ?? "");
    const schemaName = req.body.schemaName ? String(req.body.schemaName) : undefined;
    const limitInput = req.body.limit !== undefined ? Number(req.body.limit) : 50;
    const limit = clampDbPreviewLimit(limitInput);
    if (!tableName) return res.status(400).json({ error: "Body parameter 'tableName' is required." });
    assertSafeIdentifier(tableName, "tableName");
    if (schemaName) assertSafeIdentifier(schemaName, "schemaName");

    const schemaMapping =
      req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;

    const job = await runIngestionJob("database", tableName, async () => {
      const connector = new PostgresConnector();
      const sample = await connector.fetchSample(tableName, limit, schemaName);
      const normalized = normalizeRecords(sample, { schemaMapping });
      const metadata = buildMetadata({
        sourceName: tableName,
        sourceType: "database",
        entityName: tableName,
        recordCount: normalized.length,
        createdDate: new Date()
      });
      const payload: Record<string, unknown> = { preview: previewSample(normalized, limit), metadata };
      if (includeDiscoveryFromBody(req.body)) {
        payload.discovery = scanRecords(normalized, {
          sourceType: "database",
          sourceName: tableName,
          entityName: schemaName ? `${schemaName}.${tableName}` : tableName
        });
      }
      res.json(payload);
    });

    if (job.status !== "success") return res.status(500).json(job);
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/postgres/table/full", async (req, res, next) => {
  try {
    const tableName = String(req.body.tableName ?? "");
    const schemaName = req.body.schemaName ? String(req.body.schemaName) : undefined;
    const batchSizeInput = req.body.batchSize !== undefined ? Number(req.body.batchSize) : 1000;
    const batchSize = Number.isFinite(batchSizeInput) ? Math.max(1, batchSizeInput) : 1000;
    if (!tableName) return res.status(400).json({ error: "Body parameter 'tableName' is required." });
    assertSafeIdentifier(tableName, "tableName");

    const schemaMapping =
      req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;

    const maxRecordsInput = req.body.maxRecords !== undefined ? Number(req.body.maxRecords) : undefined;
    const maxRecords = clampIngestMaxRecords(maxRecordsInput);

    const job = await runIngestionJob("database", tableName, async () => {
      const connector = new PostgresConnector();
      let offset = 0;
      let total = 0;
      let sample: Record<string, unknown>[] = [];

      while (true) {
        if (maxRecords !== undefined && total >= maxRecords) break;
        const batchLimit =
          maxRecords !== undefined ? Math.min(batchSize, Math.max(0, maxRecords - total)) : batchSize;
        const batch = await connector.fetchBatch(tableName, batchLimit, offset, schemaName);
        if (!batch.length) break;

        const normalized = normalizeRecords(batch, { schemaMapping });
        if (sample.length === 0) sample = previewSample(normalized, 20);
        total += batch.length;

        offset += batch.length;
      }

      const metadata = buildMetadata({
        sourceName: tableName,
        sourceType: "database",
        entityName: tableName,
        recordCount: total,
        createdDate: new Date()
      });
      res.json({ recordCount: total, sample, metadata });
    });

    if (job.status !== "success") return res.status(500).json(job);
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/mysql/table/preview", async (req, res, next) => {
  try {
    const tableName = String(req.body.tableName ?? "");
    const limitInput = req.body.limit !== undefined ? Number(req.body.limit) : 50;
    const limit = clampDbPreviewLimit(limitInput);
    if (!tableName) return res.status(400).json({ error: "Body parameter 'tableName' is required." });
    assertSafeIdentifier(tableName, "tableName");

    const schemaMapping =
      req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;

    const job = await runIngestionJob("database", tableName, async () => {
      const connector = new MySQLConnector();
      const sample = await connector.fetchSample(tableName, limit);
      const normalized = normalizeRecords(sample, { schemaMapping });
      const metadata = buildMetadata({
        sourceName: tableName,
        sourceType: "database",
        entityName: tableName,
        recordCount: normalized.length,
        createdDate: new Date()
      });
      res.json({ preview: previewSample(normalized, limit), metadata });
    });

    if (job.status !== "success") return res.status(500).json(job);
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/mysql/table/full", async (req, res, next) => {
  try {
    const tableName = String(req.body.tableName ?? "");
    const batchSizeInput = req.body.batchSize !== undefined ? Number(req.body.batchSize) : 1000;
    const batchSize = Number.isFinite(batchSizeInput) ? Math.max(1, batchSizeInput) : 1000;
    if (!tableName) return res.status(400).json({ error: "Body parameter 'tableName' is required." });
    assertSafeIdentifier(tableName, "tableName");

    const schemaMapping =
      req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;

    const maxRecordsInput = req.body.maxRecords !== undefined ? Number(req.body.maxRecords) : undefined;
    const maxRecords = clampIngestMaxRecords(maxRecordsInput);

    const job = await runIngestionJob("database", tableName, async () => {
      const connector = new MySQLConnector();
      let offset = 0;
      let total = 0;
      let sample: Record<string, unknown>[] = [];

      while (true) {
        if (maxRecords !== undefined && total >= maxRecords) break;
        const batchLimit =
          maxRecords !== undefined ? Math.min(batchSize, Math.max(0, maxRecords - total)) : batchSize;
        const batch = await connector.fetchBatch(tableName, batchLimit, offset);
        if (!batch.length) break;

        const normalized = normalizeRecords(batch, { schemaMapping });
        if (sample.length === 0) sample = previewSample(normalized, 20);
        total += batch.length;
        offset += batch.length;
      }

      const metadata = buildMetadata({
        sourceName: tableName,
        sourceType: "database",
        entityName: tableName,
        recordCount: total,
        createdDate: new Date()
      });
      res.json({ recordCount: total, sample, metadata });
    });

    if (job.status !== "success") return res.status(500).json(job);
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/mongodb/collection/preview", async (req, res, next) => {
  try {
    const collectionName = String(req.body.collectionName ?? "");
    const limitInput = req.body.limit !== undefined ? Number(req.body.limit) : 50;
    const limit = clampDbPreviewLimit(limitInput);
    if (!collectionName) return res.status(400).json({ error: "Body parameter 'collectionName' is required." });
    assertSafeIdentifier(collectionName, "collectionName");

    const schemaMapping =
      req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;

    const job = await runIngestionJob("database", collectionName, async () => {
      const connector = new MongoDBConnector();
      const sample = await connector.fetchSample(collectionName, limit);
      const normalized = normalizeRecords(sample, { schemaMapping });
      const metadata = buildMetadata({
        sourceName: collectionName,
        sourceType: "database",
        entityName: collectionName,
        recordCount: normalized.length,
        createdDate: new Date()
      });
      res.json({ preview: previewSample(normalized, limit), metadata });
    });

    if (job.status !== "success") return res.status(500).json(job);
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/mongodb/collection/full", async (req, res, next) => {
  try {
    const collectionName = String(req.body.collectionName ?? "");
    const batchSizeInput = req.body.batchSize !== undefined ? Number(req.body.batchSize) : 1000;
    const batchSize = Number.isFinite(batchSizeInput) ? Math.max(1, batchSizeInput) : 1000;
    if (!collectionName) return res.status(400).json({ error: "Body parameter 'collectionName' is required." });
    assertSafeIdentifier(collectionName, "collectionName");

    const schemaMapping =
      req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;

    const maxRecordsInput = req.body.maxRecords !== undefined ? Number(req.body.maxRecords) : undefined;
    const maxRecords = clampIngestMaxRecords(maxRecordsInput);

    const job = await runIngestionJob("database", collectionName, async () => {
      const connector = new MongoDBConnector();
      let offset = 0;
      let total = 0;
      let sample: Record<string, unknown>[] = [];

      while (true) {
        if (maxRecords !== undefined && total >= maxRecords) break;
        const batchLimit =
          maxRecords !== undefined ? Math.min(batchSize, Math.max(0, maxRecords - total)) : batchSize;
        const batch = await connector.fetchBatch(collectionName, batchLimit, offset);
        if (!batch.length) break;

        const normalized = normalizeRecords(batch, { schemaMapping });
        if (sample.length === 0) sample = previewSample(normalized, 20);
        total += batch.length;
        offset += batch.length;
      }

      const metadata = buildMetadata({
        sourceName: collectionName,
        sourceType: "database",
        entityName: collectionName,
        recordCount: total,
        createdDate: new Date()
      });
      res.json({ recordCount: total, sample, metadata });
    });

    if (job.status !== "success") return res.status(500).json(job);
  } catch (err) {
    next(err);
  }
});

router.post("/ingest/s3/ingest", async (req, res, next) => {
  try {
    const bucket = String(req.body.bucket ?? "");
    const key = String(req.body.key ?? "");
    const batchSizeInput = req.body.batchSize !== undefined ? Number(req.body.batchSize) : 1000;
    const batchSize = Number.isFinite(batchSizeInput) ? Math.max(1, batchSizeInput) : 1000;
    const maxRecordsInput = req.body.maxRecords !== undefined ? Number(req.body.maxRecords) : undefined;
    const maxRecords = clampIngestMaxRecords(maxRecordsInput);

    if (!bucket || !key) {
      return res.status(400).json({ error: "Body parameters 'bucket' and 'key' are required." });
    }

    const schemaMapping =
      req.body.schemaMapping && typeof req.body.schemaMapping === "object" ? (req.body.schemaMapping as Record<string, string>) : undefined;

    const job = await runIngestionJob("cloud", `${bucket}/${key}`, async () => {
      let total = 0;
      let sample: Record<string, unknown>[] = [];
      const result = await ingestS3ObjectBatches({ bucket, key, maxRecords, batchSize }, async (batch) => {
        total += batch.length;
        const normalized = normalizeRecords(batch, { schemaMapping });
        if (sample.length === 0) sample = previewSample(normalized, 20);
      });

      const metadata = buildMetadata({
        sourceName: bucket,
        sourceType: "cloud",
        entityName: key,
        fileType: String(result.metadata.contentType ?? ""),
        fileSizeBytes:
          typeof result.metadata.contentLength === "number" ? result.metadata.contentLength : undefined,
        recordCount: total,
        modifiedDate: result.metadata.lastModified ? new Date(String(result.metadata.lastModified)) : undefined
      });

      res.json({
        parser: result.parser,
        recordCount: total,
        sample,
        metadata
      });
    });

    if (job.status !== "success") return res.status(500).json(job);
  } catch (err) {
    next(err);
  }
});

router.get("/history", (_req, res) => {
  res.json({ history: getIngestionHistory() });
});

export default router;
