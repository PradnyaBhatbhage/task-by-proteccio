import { Router } from "express";
import type { DiscoveryScanResult, SourceType } from "../discovery";
import type { ClassificationScanResult } from "../classification/types";
import { mappingRegistry, stableDatasetId, stableSystemId } from "../mapping";
import type { DataFlowKind } from "../mapping";
import { auditTrail } from "../audit";

const router = Router();

function parseSourceType(raw: unknown): SourceType {
  const s = String(raw ?? "file").toLowerCase();
  if (s === "database" || s === "cloud" || s === "file" || s === "api") return s;
  return "file";
}

const FLOW_KINDS: DataFlowKind[] = ["replication", "backup", "api_exposure", "etl", "sync", "other"];

function parseFlowKind(raw: unknown): DataFlowKind {
  const s = String(raw ?? "other").toLowerCase();
  if (FLOW_KINDS.includes(s as DataFlowKind)) return s as DataFlowKind;
  return "other";
}

function looksLikeDiscoveryScanResult(v: unknown): v is DiscoveryScanResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.scannedRecords === "number" &&
    Array.isArray(o.findingsPerRecord) &&
    o.trace !== undefined &&
    typeof o.trace === "object"
  );
}

function looksLikeClassificationScanResult(v: unknown): v is ClassificationScanResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.scannedRecords === "number" && Array.isArray(o.assignmentsPerRecord);
}

/**
 * POST /api/mapping/datasets
 * Body: { sourceType?, sourceName, entityName }
 * Registers a dataset + parent system using the same stable ids as discovery scans (for flows before scan).
 */
router.post("/mapping/datasets", (req, res) => {
  const sourceType = parseSourceType(req.body?.sourceType);
  const sourceName = String(req.body?.sourceName ?? "unknown-source").trim() || "unknown-source";
  const entityName = String(req.body?.entityName ?? "unknown-entity").trim() || "unknown-entity";

  const systemId = stableSystemId(sourceType, sourceName);
  const datasetId = stableDatasetId(systemId, entityName);
  const system = { id: systemId, sourceType, sourceName };
  const dataset = { id: datasetId, systemId, entityName };

  mappingRegistry.registerDatasetManual(dataset, system);
  return res.status(201).json({ system, dataset });
});

/**
 * POST /api/mapping/from-scan
 * Body: { discovery: DiscoveryScanResult, classification?: ClassificationScanResult }
 * Materializes systems, datasets, and per-finding field mappings for lineage and duplicate analysis.
 */
router.post("/mapping/from-scan", (req, res) => {
  const started = Date.now();
  const body = req.body as Record<string, unknown> | undefined;
  const discovery = body?.discovery ?? req.body;
  if (!looksLikeDiscoveryScanResult(discovery)) {
    auditTrail.append({
      source: "api:mapping/from-scan",
      action: "mapping_ingest",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "invalid_discovery" }
    });
    return res.status(400).json({ error: "Body must include a valid DiscoveryScanResult under 'discovery'." });
  }

  const classificationRaw = body?.classification;
  const classification =
    classificationRaw !== undefined && looksLikeClassificationScanResult(classificationRaw)
      ? classificationRaw
      : undefined;

  const { system, dataset, fields } = mappingRegistry.ingestDiscoveryScan(discovery, classification);
  auditTrail.append({
    source: "api:mapping/from-scan",
    action: "mapping_ingest",
    status: "success",
    durationMs: Date.now() - started,
    metadata: {
      datasetId: dataset.id,
      systemId: system.id,
      fieldsCreated: fields.length,
      scannedRecords: discovery.scannedRecords
    }
  });
  return res.status(201).json({
    system,
    dataset,
    fieldsCreated: fields.length,
    fields
  });
});

/**
 * POST /api/mapping/flows
 * Body: { fromDatasetId, toDatasetId, flowKind?, description? }
 * Declares origin → destination data movement between known datasets (e.g. DB → S3 backup → API).
 */
router.post("/mapping/flows", (req, res) => {
  try {
    const fromDatasetId = String(req.body?.fromDatasetId ?? "");
    const toDatasetId = String(req.body?.toDatasetId ?? "");
    if (!fromDatasetId || !toDatasetId) {
      return res.status(400).json({ error: "fromDatasetId and toDatasetId are required." });
    }
    const flowKind = parseFlowKind(req.body?.flowKind);
    const description =
      req.body?.description !== undefined && req.body?.description !== null
        ? String(req.body.description).slice(0, 2000)
        : undefined;

    const flow = mappingRegistry.addFlow({ fromDatasetId, toDatasetId, flowKind, description });
    return res.status(201).json(flow);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid flow";
    return res.status(400).json({ error: message });
  }
});

/** GET /api/mapping/datasets */
router.get("/mapping/datasets", (_req, res) => {
  res.json({ datasets: mappingRegistry.listDatasets() });
});

/** GET /api/mapping/systems */
router.get("/mapping/systems", (_req, res) => {
  res.json({ systems: mappingRegistry.listSystems() });
});

/** GET /api/mapping/fields?datasetId=&sensitiveCategory= */
router.get("/mapping/fields", (req, res) => {
  const datasetId = req.query.datasetId !== undefined ? String(req.query.datasetId) : undefined;
  const sensitiveCategory =
    req.query.sensitiveCategory !== undefined ? String(req.query.sensitiveCategory) : undefined;
  const fields = mappingRegistry.listFields({ datasetId, sensitiveCategory });
  res.json({ count: fields.length, fields });
});

/** GET /api/mapping/flows */
router.get("/mapping/flows", (_req, res) => {
  res.json({ flows: mappingRegistry.listFlows() });
});

/** GET /api/mapping/lineage/dataset/:datasetId */
router.get("/mapping/lineage/dataset/:datasetId", (req, res) => {
  const view = mappingRegistry.getDatasetLineage(req.params.datasetId);
  if (!view) {
    return res.status(404).json({ error: "Unknown dataset id." });
  }
  return res.json(view);
});

/** GET /api/mapping/lineage/field/:fieldId */
router.get("/mapping/lineage/field/:fieldId", (req, res) => {
  const report = mappingRegistry.getFieldLineage(req.params.fieldId);
  if (!report) {
    return res.status(404).json({ error: "Unknown field id." });
  }
  return res.json(report);
});

/** GET /api/mapping/duplicates — sensitive category + logical field across multiple datasets */
router.get("/mapping/duplicates", (_req, res) => {
  res.json({ groups: mappingRegistry.getDuplicateSensitiveGroups() });
});

/** GET /api/mapping/export — reporting-oriented snapshot */
router.get("/mapping/export", (_req, res) => {
  res.json(mappingRegistry.exportInventory());
});

export default router;
