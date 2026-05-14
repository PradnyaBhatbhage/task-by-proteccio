import type { DiscoveryScanResult, SensitiveCategory, SourceType } from "../discovery";
import type { ClassificationScanResult } from "../classification/types";
import type { RiskAssessment, RiskExposureHints, RiskLevel } from "./types";

const CATEGORY_WEIGHT: Record<SensitiveCategory, number> = {
  aadhaar: 42,
  passport: 38,
  pan: 34,
  payment_card: 40,
  bank_account: 36,
  authentication_field: 44,
  person_name: 18,
  address: 20,
  date_of_birth: 22,
  email: 16,
  phone: 18,
  ip_address: 12
};

const GOV_IDS: SensitiveCategory[] = ["aadhaar", "pan", "passport"];
const FINANCIAL: SensitiveCategory[] = ["payment_card", "bank_account"];

function sourceCriticalityMultiplier(sourceType: SourceType): number {
  if (sourceType === "api") return 1.15;
  if (sourceType === "cloud") return 1.08;
  if (sourceType === "database") return 1.0;
  return 0.95;
}

function distinctCategories(discovery: DiscoveryScanResult): Set<SensitiveCategory> {
  const s = new Set<SensitiveCategory>();
  const summary = discovery.summary ?? {};
  for (const k of Object.keys(summary) as SensitiveCategory[]) {
    if ((summary[k] ?? 0) > 0) s.add(k);
  }
  return s;
}

function sensitiveRecordCount(discovery: DiscoveryScanResult): number {
  let n = 0;
  for (const r of discovery.findingsPerRecord) {
    if (r.findings.length > 0) n += 1;
  }
  return n;
}

function totalFindings(discovery: DiscoveryScanResult): number {
  let n = 0;
  for (const r of discovery.findingsPerRecord) {
    n += r.findings.length;
  }
  return n;
}

function comboCritical(cats: Set<SensitiveCategory>): boolean {
  const hasGov = GOV_IDS.some((c) => cats.has(c));
  const hasFin = FINANCIAL.some((c) => cats.has(c));
  const hasAuth = cats.has("authentication_field");
  if (hasGov && hasFin) return true;
  if (hasAuth && (hasGov || hasFin)) return true;
  if (cats.has("aadhaar") && cats.size >= 3) return true;
  return false;
}

function volumeScore(totalRecords: number, sensitiveRecords: number, findings: number): number {
  if (totalRecords <= 0) return 0;
  const density = sensitiveRecords / totalRecords;
  const findingRate = findings / totalRecords;
  return Math.min(28, density * 22 + findingRate * 3);
}

function diversityBonus(cats: Set<SensitiveCategory>): number {
  const highValue = [...cats].reduce((acc, c) => acc + (CATEGORY_WEIGHT[c] ?? 0), 0);
  // Diminishing returns: encourage multi-attribute risk without exploding score on noise.
  return Math.min(18, Math.max(0, cats.size - 1) * 4 + highValue * 0.02);
}

function mapScoreToLevel(score: number, criticalCombo: boolean): RiskLevel {
  if (criticalCombo || score >= 86) return "critical";
  if (score >= 64) return "high";
  if (score >= 38) return "medium";
  return "low";
}

/**
 * Enterprise-oriented heuristic risk model: category weights, combinations, volume,
 * source criticality, and optional lineage-derived exposure hints.
 */
export function assessRisk(
  discovery: DiscoveryScanResult,
  classification: ClassificationScanResult | undefined,
  hints?: RiskExposureHints
): RiskAssessment {
  const factors: string[] = [];
  const cats = distinctCategories(discovery);
  const totalRecords = Math.max(0, discovery.scannedRecords);
  const sensRec = sensitiveRecordCount(discovery);
  const findings = totalFindings(discovery);

  let base = 0;
  for (const c of cats) {
    const w = CATEGORY_WEIGHT[c];
    base += w;
    factors.push(`category_weight:${c}=${w}`);
  }

  base = Math.min(72, base * 0.55);
  base += volumeScore(totalRecords, sensRec, findings);
  base += diversityBonus(cats);

  const mult = sourceCriticalityMultiplier(discovery.trace.sourceType);
  base *= mult;
  factors.push(`source_criticality_multiplier=${mult.toFixed(2)}`);

  if (classification?.summary) {
    const labels = Object.keys(classification.summary).length;
    if (labels >= 4) {
      base += 6;
      factors.push("classification_diversity_bonus=6");
    }
  }

  if (hints?.hasApiExposureFlow) {
    base += 10;
    factors.push("exposure:api_flow=+10");
  }
  if (hints?.hasReplicationOrBackupFlow) {
    base += 6;
    factors.push("exposure:replication_or_backup=+6");
  }

  const criticalCombo = comboCritical(cats);
  if (criticalCombo) {
    factors.push("combination_rule=critical_pattern");
  }

  const score = Math.max(0, Math.min(100, Math.round(base)));
  const level = mapScoreToLevel(score, criticalCombo);

  return {
    level,
    score,
    factors,
    exposureHintsApplied: hints
  };
}
