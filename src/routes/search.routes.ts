import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import type { ClassificationLabel } from "../classification/types";
import type { SensitiveCategory, SourceType } from "../discovery";
import { mappingRegistry } from "../mapping";
import type { RiskLevel } from "../risk";
import {
  parseDatasetSearchQuery,
  parseGlobalSearchQuery,
  parseLineageSearchQuery,
  parseRemediationSearchQuery,
  searchDatasets,
  searchGlobal,
  searchLineage,
  searchRemediation
} from "../search";

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

function auditSearch(
  source: string,
  started: number,
  meta: Record<string, unknown>
): void {
  auditTrail.append({
    source,
    action: "search_query",
    status: "success",
    durationMs: Date.now() - started,
    metadata: meta
  });
}

/**
 * GET /api/search/datasets
 * Filters: risk, compliance, remediation linkage, multi-label/category (AND/OR), keyword, sort, cursor pagination.
 */
router.get("/search/datasets", (req, res) => {
  const started = Date.now();
  const q = parseDatasetSearchQuery(req);
  const result = searchDatasets(q);

  auditSearch("api:search/datasets", started, {
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    hasMore: result.hasMore,
    sortBy: result.sortBy,
    filters: {
      riskLevel: q.riskLevel,
      riskLevels: q.riskLevels,
      complianceRegulation: q.complianceRegulation,
      complianceViolation: q.complianceViolation,
      hasUnresolvedRemediation: q.hasUnresolvedRemediation,
      keyword: Boolean(q.keyword),
      classificationCount: q.classificationLabels?.length ?? (q.classificationLabel ? 1 : 0),
      detectionCount: q.detectionCategories?.length ?? (q.detectionCategory ? 1 : 0)
    }
  });

  return res.json(result);
});

/**
 * GET /api/search/global
 * Cross-entity keyword search (datasets, fields, remediation, lineage, sources).
 */
router.get("/search/global", (req, res) => {
  const started = Date.now();
  const q = parseGlobalSearchQuery(req);
  if (!q) {
    return res.status(400).json({ error: "Query parameter q or keyword is required" });
  }

  const result = searchGlobal(q);
  auditSearch("api:search/global", started, {
    query: q.keyword,
    types: q.types,
    datasets: result.datasets.total,
    fields: result.fields.total,
    remediation: result.remediation.total
  });

  return res.json(result);
});

/**
 * GET /api/search/lineage
 * Source lineage queries by dataset/system, flow kind, direction, related source name.
 */
router.get("/search/lineage", (req, res) => {
  const started = Date.now();
  const q = parseLineageSearchQuery(req);
  const result = searchLineage(q);

  auditSearch("api:search/lineage", started, {
    total: result.total,
    page: result.page,
    datasetId: q.datasetId,
    systemId: q.systemId,
    direction: q.direction
  });

  return res.json(result);
});

/**
 * GET /api/search/remediation
 * Remediation-focused search with unresolved filter and cursor pagination.
 */
router.get("/search/remediation", (req, res) => {
  const started = Date.now();
  const q = parseRemediationSearchQuery(req);
  const result = searchRemediation(q);

  auditSearch("api:search/remediation", started, {
    total: result.total,
    page: result.page,
    unresolved: q.unresolved,
    status: q.status
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
  const keyword = req.query.q ? String(req.query.q) : req.query.keyword ? String(req.query.keyword) : undefined;
  const pageRaw = req.query.page !== undefined ? Number(req.query.page) : 1;
  const pageSizeRaw = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 50;
  const page = z.number().int().positive().safeParse(pageRaw).success ? Number(pageRaw) : 1;
  const pageSize = Math.min(200, Math.max(1, z.number().int().positive().safeParse(pageSizeRaw).success ? Number(pageSizeRaw) : 50));

  let all = mappingRegistry.listFields({ datasetId, sensitiveCategory });
  if (keyword) {
    const needle = keyword.toLowerCase();
    all = all.filter(
      (f) =>
        f.logicalFieldKey.toLowerCase().includes(needle) ||
        f.jsonPath.toLowerCase().includes(needle) ||
        f.sensitiveCategory.toLowerCase().includes(needle) ||
        f.datasetId.toLowerCase().includes(needle)
    );
  }

  const total = all.length;
  const start = (page - 1) * pageSize;
  const fields = all.slice(start, start + pageSize);

  auditSearch("api:search/mapped-fields", started, {
    total,
    page,
    pageSize,
    datasetIdProvided: Boolean(datasetId),
    categoryFilter: Boolean(sensitiveCategory),
    keyword: Boolean(keyword)
  });

  return res.json({ items: fields, total, page, pageSize, hasMore: start + pageSize < total });
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

  auditSearch("api:search/duplicate-sensitive", started, {
    total,
    page,
    pageSize,
    minDatasets,
    categoryFilter: Boolean(sensitiveCategory)
  });

  return res.json({ items, total, page, pageSize, hasMore: start + pageSize < total });
});

export default router;
