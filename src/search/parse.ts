import type { Request } from "express";
import type { ClassificationLabel } from "../classification/types";
import type { SensitiveCategory, SourceType } from "../discovery";
import type { ComplianceRegulation, ComplianceStatus } from "../risk/compliance/types";
import type { RiskLevel } from "../risk/types";
import { ALL_REGULATIONS } from "../risk";
import type {
  DatasetSearchQuery,
  DetectionMatchMode,
  ClassificationMatchMode,
  GlobalSearchEntityType,
  GlobalSearchQuery,
  LineageSearchQuery,
  RemediationSearchQuery,
  SearchSortField,
  SortOrder
} from "./types";

const ALL_RISK: RiskLevel[] = ["low", "medium", "high", "critical"];

function parseRiskLevel(raw: unknown): RiskLevel | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  return ALL_RISK.includes(s as RiskLevel) ? (s as RiskLevel) : undefined;
}

function parseRiskLevels(raw: unknown): RiskLevel[] | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parts = String(raw)
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const levels = parts.map((p) => ALL_RISK.find((r) => r === p)).filter((r): r is RiskLevel => Boolean(r));
  return levels.length ? levels : undefined;
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

function parseCategories(raw: unknown): SensitiveCategory[] | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parts = String(raw)
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const cats = parts.map((p) => ALL_CATEGORIES.find((c) => c === p)).filter((c): c is SensitiveCategory => Boolean(c));
  return cats.length ? cats : undefined;
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

function parseClassificationLabels(raw: unknown): ClassificationLabel[] | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parts = String(raw)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const labels = parts
    .map((p) => ALL_LABELS.find((l) => l.toLowerCase() === p.toLowerCase()))
    .filter((l): l is ClassificationLabel => Boolean(l));
  return labels.length ? labels : undefined;
}

function parseRegulation(raw: unknown): ComplianceRegulation | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toUpperCase();
  return ALL_REGULATIONS.includes(s as ComplianceRegulation) ? (s as ComplianceRegulation) : undefined;
}

const COMPLIANCE_STATUSES: ComplianceStatus[] = ["compliant", "partial", "non_compliant", "not_applicable"];

function parseComplianceStatus(raw: unknown): ComplianceStatus | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase().replace(/\s+/g, "_") as ComplianceStatus;
  return COMPLIANCE_STATUSES.includes(s) ? s : undefined;
}

function parseMatchMode(raw: unknown): ClassificationMatchMode | DetectionMatchMode | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  if (s === "and" || s === "or") return s;
  return undefined;
}

function parseSortField(raw: unknown): SearchSortField | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw);
  const allowed: SearchSortField[] = [
    "updatedAt",
    "riskScore",
    "riskLevel",
    "sourceName",
    "complianceScore"
  ];
  return allowed.includes(s as SearchSortField) ? (s as SearchSortField) : undefined;
}

function parseSortOrder(raw: unknown): SortOrder | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).toLowerCase();
  return s === "asc" || s === "desc" ? s : undefined;
}

function parseBool(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (raw === true || raw === "true" || raw === "1") return true;
  if (raw === false || raw === "false" || raw === "0") return false;
  return undefined;
}

function parseNumber(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function parseDatasetSearchQuery(req: Request): DatasetSearchQuery {
  const regulation =
    parseRegulation(req.query.complianceRegulation ?? req.query.regulation) ??
    parseRegulation(req.query.framework);

  return {
    riskLevel: parseRiskLevel(req.query.riskLevel),
    riskLevels: parseRiskLevels(req.query.riskLevels ?? req.query.riskLevel),
    minRiskScore: parseNumber(req.query.minRiskScore),
    maxRiskScore: parseNumber(req.query.maxRiskScore),
    classificationLabel: parseClassificationLabel(req.query.classification),
    classificationLabels: parseClassificationLabels(req.query.classifications ?? req.query.classification),
    classificationMode: parseMatchMode(req.query.classificationMode),
    sourceType: parseSourceType(req.query.sourceType),
    sourceNameContains: req.query.sourceName ? String(req.query.sourceName) : undefined,
    systemId: req.query.systemId ? String(req.query.systemId) : undefined,
    datasetId: req.query.datasetId ? String(req.query.datasetId) : undefined,
    detectionCategory: parseCategory(req.query.detectionType ?? req.query.detectionCategory),
    detectionCategories: parseCategories(req.query.detectionCategories ?? req.query.detectionTypes),
    detectionMode: parseMatchMode(req.query.detectionMode),
    mappedOnly: parseBool(req.query.mappedOnly),
    complianceRegulation: regulation,
    complianceViolation: parseBool(req.query.complianceViolation ?? req.query.violationsOnly),
    complianceStatus: parseComplianceStatus(req.query.complianceStatus),
    hasUnresolvedRemediation: parseBool(req.query.hasUnresolvedRemediation ?? req.query.unresolvedRemediation),
    keyword: req.query.q ? String(req.query.q) : req.query.keyword ? String(req.query.keyword) : undefined,
    sortBy: parseSortField(req.query.sortBy),
    sortOrder: parseSortOrder(req.query.sortOrder),
    page: parseNumber(req.query.page),
    pageSize: parseNumber(req.query.pageSize),
    cursor: req.query.cursor ? String(req.query.cursor) : undefined
  };
}

export function parseRemediationSearchQuery(req: Request): RemediationSearchQuery {
  const statusRaw = req.query.status;
  let status: RemediationSearchQuery["status"];
  if (statusRaw !== undefined && statusRaw !== null && statusRaw !== "") {
    const s = String(statusRaw).toLowerCase().replace(/\s+/g, "_");
    if (s === "open" || s === "in_progress" || s === "resolved" || s === "closed") {
      status = s;
    }
  }

  return {
    status,
    severity: parseRiskLevel(req.query.severity) as RemediationSearchQuery["severity"],
    datasetId: req.query.datasetId ? String(req.query.datasetId) : undefined,
    keyword: req.query.q ? String(req.query.q) : req.query.keyword ? String(req.query.keyword) : undefined,
    unresolved: parseBool(req.query.unresolved) ?? parseBool(req.query.unresolvedOnly),
    page: parseNumber(req.query.page),
    pageSize: parseNumber(req.query.pageSize),
    sortBy:
      req.query.sortBy === "severity" || req.query.sortBy === "createdAt" || req.query.sortBy === "updatedAt"
        ? (req.query.sortBy as RemediationSearchQuery["sortBy"])
        : undefined,
    sortOrder: parseSortOrder(req.query.sortOrder),
    cursor: req.query.cursor ? String(req.query.cursor) : undefined
  };
}

export function parseLineageSearchQuery(req: Request): LineageSearchQuery {
  const dir = req.query.direction ? String(req.query.direction).toLowerCase() : undefined;
  let direction: LineageSearchQuery["direction"];
  if (dir === "upstream" || dir === "downstream" || dir === "both") {
    direction = dir;
  }

  return {
    datasetId: req.query.datasetId ? String(req.query.datasetId) : undefined,
    systemId: req.query.systemId ? String(req.query.systemId) : undefined,
    direction,
    flowKind: req.query.flowKind ? String(req.query.flowKind) : undefined,
    relatedSourceName: req.query.relatedSourceName
      ? String(req.query.relatedSourceName)
      : req.query.sourceName
        ? String(req.query.sourceName)
        : undefined,
    page: parseNumber(req.query.page),
    pageSize: parseNumber(req.query.pageSize)
  };
}

const GLOBAL_TYPES: GlobalSearchEntityType[] = ["datasets", "fields", "remediation", "lineage", "sources"];

export function parseGlobalSearchQuery(req: Request): GlobalSearchQuery | undefined {
  const keyword = req.query.q ? String(req.query.q).trim() : req.query.keyword ? String(req.query.keyword).trim() : "";
  if (!keyword) return undefined;

  let types: GlobalSearchEntityType[] | undefined;
  if (req.query.types) {
    const parts = String(req.query.types)
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    types = parts.filter((t): t is GlobalSearchEntityType =>
      GLOBAL_TYPES.includes(t as GlobalSearchEntityType)
    ) as GlobalSearchEntityType[];
    if (!types.length) types = undefined;
  }

  return {
    keyword,
    types,
    page: parseNumber(req.query.page),
    pageSize: parseNumber(req.query.pageSize)
  };
}
