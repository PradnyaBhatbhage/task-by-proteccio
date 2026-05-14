import { Router } from "express";
import type { DiscoveryScanResult } from "../discovery";
import { classifyDiscoveryScan } from "../classification";
import { auditTrail } from "../audit";

const router = Router();

function looksLikeDiscoveryScanResult(v: unknown): v is DiscoveryScanResult {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return Array.isArray(obj.findingsPerRecord) && typeof obj.scannedRecords === "number";
}

/**
 * POST /api/classification/classify
 * Body:
 *   { discovery: DiscoveryScanResult }  OR  DiscoveryScanResult (direct)
 */
router.post("/classification/classify", async (req, res, next) => {
  const started = Date.now();
  try {
    const body = req.body as unknown;
    const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;
    const discovery = bodyObj && "discovery" in bodyObj ? bodyObj.discovery : body;

    if (!looksLikeDiscoveryScanResult(discovery)) {
      auditTrail.append({
        source: "api:classification/classify",
        action: "classification",
        status: "failure",
        durationMs: Date.now() - started,
        metadata: { reason: "invalid_discovery" }
      });
      return res.status(400).json({ error: "Request body must include a DiscoveryScanResult under 'discovery'." });
    }

    const result = classifyDiscoveryScan(discovery);
    auditTrail.append({
      source: "api:classification/classify",
      action: "classification",
      status: "success",
      durationMs: Date.now() - started,
      metadata: {
        scannedRecords: result.scannedRecords,
        labelCount: Object.keys(result.summary ?? {}).length
      }
    });
    res.json(result);
  } catch (err) {
    auditTrail.append({
      source: "api:classification/classify",
      action: "classification",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { error: err instanceof Error ? err.name : "unknown" }
    });
    next(err);
  }
});

export default router;

