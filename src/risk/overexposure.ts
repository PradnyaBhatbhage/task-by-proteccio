import type { ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult, SensitiveCategory } from "../discovery";
import type { OverexposedSensitiveRecord } from "./types";
import { comboCriticalFromDiscovery } from "./factors";

const PUBLIC_PATH_HINTS = ["public", "url", "website", "share", "export", "webhook", "callback"];

const GOV_IDS: SensitiveCategory[] = ["aadhaar", "pan", "passport"];
const FINANCIAL: SensitiveCategory[] = ["payment_card", "bank_account"];

function recordCategories(findings: DiscoveryScanResult["findingsPerRecord"][0]["findings"]): SensitiveCategory[] {
  return [...new Set(findings.map((f) => f.category))];
}

function recordLabels(
  recordIndex: number,
  classification?: ClassificationScanResult
): ClassificationScanResult["assignmentsPerRecord"][0]["assignments"][0]["label"][] {
  if (!classification) return [];
  const row = classification.assignmentsPerRecord.find((r) => r.recordIndex === recordIndex);
  if (!row) return [];
  return [...new Set(row.assignments.map((a) => a.label))];
}

function hasPublicPathHint(findings: DiscoveryScanResult["findingsPerRecord"][0]["findings"]): boolean {
  return findings.some((f) => {
    const p = (f.path ?? "").toLowerCase();
    return PUBLIC_PATH_HINTS.some((h) => p.includes(h));
  });
}

function recordComboCritical(categories: SensitiveCategory[]): boolean {
  const cats = new Set(categories);
  const hasGov = GOV_IDS.some((c) => cats.has(c));
  const hasFin = FINANCIAL.some((c) => cats.has(c));
  const hasAuth = cats.has("authentication_field");
  return (hasGov && hasFin) || (hasAuth && (hasGov || hasFin));
}

/**
 * Identifies records with elevated exposure: high finding density, critical combos,
 * sensitive labels on potentially public fields, or unusually broad attribute sets.
 */
export function detectOverexposedRecords(
  discovery: DiscoveryScanResult,
  classification?: ClassificationScanResult,
  options?: { maxResults?: number; minExposureScore?: number }
): OverexposedSensitiveRecord[] {
  const maxResults = options?.maxResults ?? 100;
  const minScore = options?.minExposureScore ?? 40;
  const batchCritical = comboCriticalFromDiscovery(discovery);

  const findingsPerRecord = discovery.findingsPerRecord.map((r) => r.findings.length);
  const median =
    findingsPerRecord.length === 0
      ? 0
      : [...findingsPerRecord].sort((a, b) => a - b)[Math.floor(findingsPerRecord.length / 2)];

  const results: OverexposedSensitiveRecord[] = [];

  for (const rr of discovery.findingsPerRecord) {
    if (rr.findings.length === 0) continue;

    const categories = recordCategories(rr.findings);
    const labels = recordLabels(rr.recordIndex, classification);
    const reasons: string[] = [];
    let exposureScore = 0;

    if (rr.findings.length >= Math.max(15, median * 6)) {
      exposureScore += 35;
      reasons.push("high_finding_density");
    }
    if (recordComboCritical(categories)) {
      exposureScore += 40;
      reasons.push("critical_attribute_combination_on_record");
    }
    if (hasPublicPathHint(rr.findings)) {
      exposureScore += 25;
      reasons.push("finding_on_public_or_url_like_field");
    }
    if (labels.includes("Sensitive Personal Data") || labels.includes("Authentication Data")) {
      exposureScore += 20;
      reasons.push("high_sensitivity_classification_label");
    }
    if (categories.length >= 4) {
      exposureScore += 15;
      reasons.push("many_distinct_sensitive_categories");
    }
    if (batchCritical && rr.findings.length >= 3) {
      exposureScore += 10;
      reasons.push("dataset_has_critical_combination_context");
    }

    exposureScore = Math.min(100, exposureScore);
    if (exposureScore >= minScore) {
      results.push({
        recordIndex: rr.recordIndex,
        findingCount: rr.findings.length,
        categories,
        classificationLabels: labels,
        exposureScore,
        reasons
      });
    }
  }

  return results.sort((a, b) => b.exposureScore - a.exposureScore).slice(0, maxResults);
}
