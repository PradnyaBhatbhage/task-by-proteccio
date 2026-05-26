import type { ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult, SensitiveCategory, SourceType } from "../discovery";
import type { ProfilingReport } from "../profiling";
import type { RiskExposureHints, RiskFactorContribution, RiskFactorId, RiskLevel } from "./types";

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

function rawToSeverity(raw: number): RiskLevel {
  if (raw >= 75) return "critical";
  if (raw >= 55) return "high";
  if (raw >= 30) return "medium";
  return "low";
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

function sourceExposureMultiplier(sourceType: SourceType): number {
  if (sourceType === "api") return 1.15;
  if (sourceType === "cloud") return 1.08;
  if (sourceType === "database") return 1.0;
  return 0.95;
}

function buildContribution(
  id: RiskFactorId,
  label: string,
  rawScore: number,
  weight: number,
  details: string[]
): RiskFactorContribution {
  const clamped = Math.max(0, Math.min(100, Math.round(rawScore)));
  return {
    id,
    label,
    rawScore: clamped,
    weight,
    weightedScore: Math.round(clamped * weight * 100) / 100,
    severity: rawToSeverity(clamped),
    details
  };
}

export interface FactorContext {
  discovery: DiscoveryScanResult;
  classification?: ClassificationScanResult;
  profile?: ProfilingReport;
  hints?: RiskExposureHints;
}

export function computeSensitiveDataVolume(ctx: FactorContext, weight: number): RiskFactorContribution {
  const { discovery } = ctx;
  const totalRecords = Math.max(0, discovery.scannedRecords);
  const sensRec = sensitiveRecordCount(discovery);
  const findings = totalFindings(discovery);
  const details: string[] = [];

  if (totalRecords <= 0) {
    return buildContribution("sensitive_data_volume", "Volume of sensitive data", 0, weight, ["no_records_scanned"]);
  }

  const density = sensRec / totalRecords;
  const findingRate = findings / totalRecords;
  let raw = Math.min(100, density * 70 + findingRate * 12 + Math.log10(Math.max(1, sensRec)) * 8);
  details.push(`sensitive_records=${sensRec}/${totalRecords}`);
  details.push(`density=${(density * 100).toFixed(1)}%`);
  details.push(`findings=${findings}`);

  if (sensRec >= 1000) {
    raw = Math.min(100, raw + 8);
    details.push("large_sensitive_volume_bonus=8");
  }

  return buildContribution("sensitive_data_volume", "Volume of sensitive data", raw, weight, details);
}

export function computeSensitiveDataType(ctx: FactorContext, weight: number): RiskFactorContribution {
  const cats = distinctCategories(ctx.discovery);
  const details: string[] = [];
  let raw = 0;

  for (const c of cats) {
    const w = CATEGORY_WEIGHT[c] ?? 10;
    raw += w;
    details.push(`${c}:weight=${w}`);
  }

  raw = Math.min(100, raw * 0.55);
  const mult = sourceExposureMultiplier(ctx.discovery.trace.sourceType);
  raw = Math.min(100, raw * mult);
  details.push(`source_multiplier=${mult.toFixed(2)}`);

  if (ctx.classification?.summary) {
    const labels = Object.keys(ctx.classification.summary).length;
    if (labels >= 4) {
      raw = Math.min(100, raw + 6);
      details.push("classification_diversity_bonus=6");
    }
  }

  return buildContribution("sensitive_data_type", "Type of sensitive data", raw, weight, details);
}

export function computeAttributeCombination(ctx: FactorContext, weight: number): RiskFactorContribution {
  const cats = distinctCategories(ctx.discovery);
  const details: string[] = [];
  let raw = Math.min(40, Math.max(0, (cats.size - 1) * 10));

  if (comboCritical(cats)) {
    raw = 95;
    details.push("critical_combination_pattern");
  } else if (cats.size >= 4) {
    raw = Math.max(raw, 65);
    details.push(`multi_attribute_categories=${cats.size}`);
  } else if (cats.size >= 2) {
    raw = Math.max(raw, 40);
    details.push(`combined_categories=${[...cats].join(",")}`);
  }

  return buildContribution("attribute_combination", "Multiple sensitive attributes", raw, weight, details);
}

export function computePublicExposure(ctx: FactorContext, weight: number): RiskFactorContribution {
  const { discovery, hints } = ctx;
  const details: string[] = [];
  let raw = 0;

  if (discovery.trace.sourceType === "api") {
    raw += 35;
    details.push("source_type=api");
  }
  if (discovery.trace.sourceType === "cloud") {
    raw += 20;
    details.push("source_type=cloud");
  }
  if (hints?.hasApiExposureFlow) {
    raw += 30;
    details.push("lineage:api_exposure_flow");
  }
  if (hints?.isPubliclyExposed) {
    raw += 40;
    details.push("hint:publicly_exposed");
  }
  if (hints?.hasReplicationOrBackupFlow) {
    raw += 12;
    details.push("lineage:replication_or_backup");
  }

  return buildContribution("public_exposure", "Public exposure possibility", Math.min(100, raw), weight, details);
}

export function computeMissingEncryption(ctx: FactorContext, weight: number): RiskFactorContribution {
  const { discovery, hints } = ctx;
  const details: string[] = [];
  let raw = 0;

  if (hints?.encryptionIndicated === false) {
    raw += 55;
    details.push("encryption_not_indicated");
  } else if (hints?.encryptionIndicated === undefined && discovery.trace.sourceType === "api") {
    raw += 25;
    details.push("api_source_no_encryption_signal");
  } else if (hints?.encryptionIndicated === true) {
    raw += 5;
    details.push("encryption_indicated_low_residual");
  }

  if (hints?.hasApiExposureFlow && hints?.encryptionIndicated !== true) {
    raw = Math.min(100, raw + 20);
    details.push("exposed_flow_without_encryption");
  }

  return buildContribution("missing_encryption", "Missing encryption indicators", Math.min(100, raw), weight, details);
}

export function computeDuplicateStorage(ctx: FactorContext, weight: number): RiskFactorContribution {
  const { profile, hints } = ctx;
  const details: string[] = [];
  let raw = 0;

  const internalGroups = profile?.duplicateSensitivePatterns.groups.length ?? 0;
  if (internalGroups > 0) {
    raw += Math.min(40, internalGroups * 6);
    details.push(`in_dataset_duplicate_patterns=${internalGroups}`);
  }

  const crossCount = hints?.crossDatasetDuplicateGroupCount ?? 0;
  if (crossCount > 0) {
    raw += Math.min(50, crossCount * 12);
    details.push(`cross_dataset_duplicate_groups=${crossCount}`);
  }

  return buildContribution("duplicate_storage", "Duplicate sensitive data storage", Math.min(100, raw), weight, details);
}

export function computeOrphanedSensitiveData(ctx: FactorContext, weight: number): RiskFactorContribution {
  const { discovery, hints } = ctx;
  const sensRec = sensitiveRecordCount(discovery);
  const details: string[] = [];
  let raw = 0;

  if (sensRec === 0) {
    return buildContribution("orphaned_sensitive_data", "Unused or orphaned sensitive data", 0, weight, [
      "no_sensitive_records"
    ]);
  }

  if (hints?.unmappedDataset) {
    raw += 35;
    details.push("dataset_not_in_mapping_registry");
  }
  if (hints?.noLineageFlows) {
    raw += 25;
    details.push("no_lineage_flows");
  }
  const days = hints?.daysSinceLastActivity;
  if (days !== undefined && days >= 90) {
    raw += Math.min(30, Math.floor(days / 30) * 5);
    details.push(`stale_days=${days}`);
  }

  return buildContribution("orphaned_sensitive_data", "Unused or orphaned sensitive data", Math.min(100, raw), weight, details);
}

export const RISK_FACTOR_COMPUTERS: Record<
  RiskFactorId,
  (ctx: FactorContext, weight: number) => RiskFactorContribution
> = {
  sensitive_data_volume: computeSensitiveDataVolume,
  sensitive_data_type: computeSensitiveDataType,
  attribute_combination: computeAttributeCombination,
  public_exposure: computePublicExposure,
  missing_encryption: computeMissingEncryption,
  duplicate_storage: computeDuplicateStorage,
  orphaned_sensitive_data: computeOrphanedSensitiveData
};

export function comboCriticalFromDiscovery(discovery: DiscoveryScanResult): boolean {
  return comboCritical(distinctCategories(discovery));
}
