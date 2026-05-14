import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import { governanceCatalog } from "../catalog";
import type { ClassificationLabel } from "../classification/types";
import type { SensitiveCategory, SourceType } from "../discovery";
import { mappingRegistry } from "../mapping";
import type { RiskLevel } from "../risk";

const router = Router();

const ALL_RISK: RiskLevel[] = ["low", "medium", "high", "critical"];

function parseRiskLevel(raw: unknown): RiskLevel | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  return ALL_RISK.includes(s as RiskLevel) ? (s as RiskLevel) : undefined;
}

function parseSourceType(raw: unknown): SourceType | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  if (s === "database" || s === "cloud" || s === "file" || s === "api") return s;
  return undefined;
}

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

function parseCategory(raw: unknown): SensitiveCategory | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  return ALL_CATEGORIES.includes(s as SensitiveCategory) ? (s as SensitiveCategory) : undefined;
}

const ALL_LABELS: ClassificationLabel[] = [
  "Personal Data",
  "Sensitive Personal Data",
  "Financial Data",
  "Health Data",
  "Authentication Data",
  "Organizational Confidential Data",
  "Public Data"
];

function parseClassificationLabel(raw: unknown): ClassificationLabel | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw);
  return ALL_LABELS.includes(s as ClassificationLabel) ? (s as ClassificationLabel) : undefined;
}

/**
 * GET /api/search/datasets
 * Query: riskLevel, classification, sourceType, sourceNameContains, detectionCategory, mappedOnly, page, pageSize
 */
router.get("/search/datasets", (req, res) => {
  const started = Date.now();
  const pageRaw = req.query.page !== undefined ? Number(req.query.page) : 1;
  const pageSizeRaw = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 25;
  const pageParsed = z.number().int().positive().safeParse(pageRaw);
  const pageSizeParsed = z.number().int().positive().max(200).safeParse(pageSizeRaw);

  const q = {
    riskLevel: parseRiskLevel(req.query.riskLevel),
    classificationLabel: parseClassificationLabel(req.query.classification),
    sourceType: parseSourceType(req.query.sourceType),
    sourceNameContains: req.query.sourceName ? String(req.query.sourceName) : undefined,
    detectionCategory: parseCategory(req.query.detectionType ?? req.query.detectionCategory),
    mappedOnly: req.query.mappedOnly === "true" || req.query.mappedOnly === "1",
    page: pageParsed.success ? pageParsed.data : 1,
    pageSize: pageSizeParsed.success ? pageSizeParsed.data : 25
  };

  const result = governanceCatalog.query(q);

  auditTrail.append({
    source: "api:search/datasets",
    action: "search_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      filters: {
        riskLevel: q.riskLevel,
        classification: q.classificationLabel,
        sourceType: q.sourceType,
        mappedOnly: q.mappedOnly,
        hasDetectionCategory: Boolean(q.detectionCategory)
      }
    }
  });

  return res.json(result);
});

/**
 * GET /api/search/mapped-fields
 * Query: datasetId?, sensitiveCategory?, page, pageSize
 */
router.get("/search/mapped-fields", (req, res) => {
  const started = Date.now();
  const datasetId = req.query.datasetId !== undefined ? String(req.query.datasetId) : undefined;
  const sensitiveCategory = parseCategory(req.query.sensitiveCategory ?? req.query.detectionType);
  const pageRaw = req.query.page !== undefined ? Number(req.query.page) : 1;
  const pageSizeRaw = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 50;
  const page = z.number().int().positive().safeParse(pageRaw).success ? Number(pageRaw) : 1;
  const pageSize = Math.min(200, Math.max(1, z.number().int().positive().safeParse(pageSizeRaw).success ? Number(pageSizeRaw) : 50));

  const all = mappingRegistry.listFields({ datasetId, sensitiveCategory });
  const total = all.length;
  const start = (page - 1) * pageSize;
  const fields = all.slice(start, start + pageSize);

  auditTrail.append({
    source: "api:search/mapped-fields",
    action: "search_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: { total, page, pageSize, datasetIdProvided: Boolean(datasetId), categoryFilter: Boolean(sensitiveCategory) }
  });

  return res.json({ items: fields, total, page, pageSize });
});

/**
 * GET /api/search/duplicate-sensitive
 * Cross-source duplicate sensitive semantics (uses mapping registry inventory).
 * Query: sensitiveCategory?, minDatasets?, page, pageSize
 */
router.get("/search/duplicate-sensitive", (req, res) => {
  const started = Date.now();
  const sensitiveCategory = parseCategory(req.query.sensitiveCategory ?? req.query.detectionType);
  const minDatasetsRaw = req.query.minDatasets !== undefined ? Number(req.query.minDatasets) : 2;
  const minDatasets = Number.isFinite(minDatasetsRaw) ? Math.max(2, Math.floor(minDatasetsRaw)) : 2;

  const pageRaw = req.query.page !== undefined ? Number(req.query.page) : 1;
  const pageSizeRaw = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 25;
  const page = z.number().int().positive().safeParse(pageRaw).success ? Number(pageRaw) : 1;
  const pageSize = Math.min(200, Math.max(1, z.number().int().positive().safeParse(pageSizeRaw).success ? Number(pageSizeRaw) : 25));

  let groups = mappingRegistry.getDuplicateSensitiveGroups();
  if (sensitiveCategory) {
    groups = groups.filter((g) => g.sensitiveCategory === sensitiveCategory);
  }
  groups = groups.filter((g) => g.datasetIds.length >= minDatasets);

  const total = groups.length;
  const start = (page - 1) * pageSize;
  const items = groups.slice(start, start + pageSize);

  auditTrail.append({
    source: "api:search/duplicate-sensitive",
    action: "search_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: { total, page, pageSize, minDatasets, categoryFilter: Boolean(sensitiveCategory) }
  });

  return res.json({ items, total, page, pageSize });
});

export default router;
