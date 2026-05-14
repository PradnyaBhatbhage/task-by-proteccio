import { Router } from "express";
import {
  scanRecords,
  scanRecordsBatched,
  type DiscoveryScanOptions,
  type SensitiveCategory,
  type SourceType
} from "../discovery";
import { classifyDiscoveryScan } from "../classification";
import { auditTrail } from "../audit";

const router = Router();

const ALL_CATEGORIES: SensitiveCategory[] = [
  "email",
  "phone",
  "aadhaar",
  "pan",
  "passport",
  "ip_address",
  "payment_card",
  "bank_account",
  "person_name",
  "address",
  "date_of_birth",
  "authentication_field"
];

function parseSourceType(raw: unknown): SourceType {
  const s = String(raw ?? "file").toLowerCase();
  if (s === "database" || s === "cloud" || s === "file" || s === "api") return s;
  return "file";
}

/**
 * POST /api/discovery/scan
 * Body: { records: object[], sourceType?, sourceName?, entityName?, batchSize?, maxDepth?, maxLeavesPerRecord? }
 * Runs sensitive-data discovery with full source traceability on the provided record batch.
 */
router.post("/discovery/scan", async (req, res, next) => {
  const started = Date.now();
  try {
    const { records } = req.body ?? {};
    if (!Array.isArray(records)) {
      auditTrail.append({
        source: "api:discovery/scan",
        action: "discovery_scan",
        status: "failure",
        durationMs: Date.now() - started,
        metadata: { reason: "invalid_body" }
      });
      return res.status(400).json({ error: "Body must include 'records' as an array of objects." });
    }

    const classifyRequested =
      req.body?.classify === true ||
      req.body?.classify === "true" ||
      req.body?.classify === 1 ||
      req.body?.classify === "1";

    const sourceType = parseSourceType(req.body?.sourceType);
    const sourceName = String(req.body?.sourceName ?? "unknown-source");
    const entityName = String(req.body?.entityName ?? "unknown-entity");

    const options: DiscoveryScanOptions | undefined =
      req.body?.maxDepth !== undefined || req.body?.maxLeavesPerRecord !== undefined
        ? {
            maxDepth:
              req.body.maxDepth !== undefined && Number.isFinite(Number(req.body.maxDepth))
                ? Math.max(1, Number(req.body.maxDepth))
                : undefined,
            maxLeavesPerRecord:
              req.body.maxLeavesPerRecord !== undefined && Number.isFinite(Number(req.body.maxLeavesPerRecord))
                ? Math.max(1, Number(req.body.maxLeavesPerRecord))
                : undefined
          }
        : undefined;

    const batchInput = req.body?.batchSize !== undefined ? Number(req.body.batchSize) : undefined;
    const batchSize =
      batchInput !== undefined && Number.isFinite(batchInput) ? Math.max(1, Math.floor(batchInput)) : undefined;

    const normalizedRecords = records as Record<string, unknown>[];
    const trace = { sourceType, sourceName, entityName };

    if (batchSize !== undefined) {
      const result = await scanRecordsBatched(normalizedRecords, trace, batchSize, options);
      if (classifyRequested) {
        const classification = classifyDiscoveryScan(result);
        auditTrail.append({
          source: "api:discovery/scan",
          action: "discovery_scan",
          status: "success",
          durationMs: Date.now() - started,
          metadata: {
            scannedRecords: result.scannedRecords,
            classify: true,
            batched: true,
            sourceType: trace.sourceType
          }
        });
        return res.json({ discovery: result, classification });
      }
      auditTrail.append({
        source: "api:discovery/scan",
        action: "discovery_scan",
        status: "success",
        durationMs: Date.now() - started,
        metadata: {
          scannedRecords: result.scannedRecords,
          classify: false,
          batched: true,
          sourceType: trace.sourceType
        }
      });
      return res.json(result);
    }

    const result = scanRecords(normalizedRecords, trace, options);
    if (classifyRequested) {
      const classification = classifyDiscoveryScan(result);
      auditTrail.append({
        source: "api:discovery/scan",
        action: "discovery_scan",
        status: "success",
        durationMs: Date.now() - started,
        metadata: {
          scannedRecords: result.scannedRecords,
          classify: true,
          batched: false,
          sourceType: trace.sourceType
        }
      });
      return res.json({ discovery: result, classification });
    }
    auditTrail.append({
      source: "api:discovery/scan",
      action: "discovery_scan",
      status: "success",
      durationMs: Date.now() - started,
      metadata: {
        scannedRecords: result.scannedRecords,
        classify: false,
        batched: false,
        sourceType: trace.sourceType
      }
    });
    return res.json(result);
  } catch (err) {
    auditTrail.append({
      source: "api:discovery/scan",
      action: "scan_failed",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { error: err instanceof Error ? err.name : "unknown" }
    });
    next(err);
  }
});

router.get("/discovery/categories", (_req, res) => {
  res.json({
    categories: ALL_CATEGORIES,
    methods: ["regex", "rule_validation", "keyword", "pattern"]
  });
});

export default router;
