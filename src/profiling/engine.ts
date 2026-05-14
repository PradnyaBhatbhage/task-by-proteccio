import { createHash } from "node:crypto";
import type { ClassificationLabel, ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult, SensitiveCategory } from "../discovery";
import { flattenRecord } from "../discovery/flatten";
import type { DiscoveryScanOptions } from "../discovery/types";

export interface FieldNullStats {
  path: string;
  nullCount: number;
  presentCount: number;
  nullRate: number;
}

export interface FieldValueDistributionBucket {
  path: string;
  /** Count of distinct value fingerprints observed (capped for memory). */
  approximateDistinctValues: number;
  /** Whether the distinct counter hit the internal cap (more values likely exist). */
  distinctCapped: boolean;
  /** Top repeated fingerprints with counts (opaque hashes only). */
  topDuplicates: { fingerprint: string; count: number }[];
}

export interface SensitiveDensityStats {
  /** Total sensitive findings across all records. */
  sensitiveFindings: number;
  /** Records with at least one sensitive finding. */
  sensitiveRecordCount: number;
  /** Findings per sensitive record (mean). */
  findingsPerSensitiveRecord: number;
  /** Sensitive findings divided by scanned records. */
  sensitiveFindingsPerTotalRecord: number;
}

export interface AnomalyFinding {
  kind: "high_finding_density_record" | "category_concentration" | "unbalanced_classification";
  severity: "low" | "medium" | "high";
  detail: string;
  recordIndex?: number;
}

export interface ProfilingReport {
  trace: DiscoveryScanResult["trace"];
  totalRecords: number;
  sensitiveRecordCount: number;
  sensitiveDensity: SensitiveDensityStats;
  discoveryCategoryDistribution: Partial<Record<SensitiveCategory, number>>;
  classificationDistribution: Partial<Record<ClassificationLabel, number>>;
  /** Per logical field (from discovery paths): how many findings landed on that field key. */
  fieldFindingDistribution: Record<string, number>;
  sourceInsights: {
    sourceType: DiscoveryScanResult["trace"]["sourceType"];
    sourceName: string;
    entityName: string;
    uniqueLogicalFieldsWithFindings: number;
    topFieldsByFindingCount: { field: string; count: number }[];
  };
  nullAnalysis?: FieldNullStats[];
  valueDistribution?: FieldValueDistributionBucket[];
  /** Estimated unique records by hashing canonical JSON per record (optional pass-in). */
  uniqueRecordEstimate?: { uniqueCount: number; totalHashed: number };
  duplicateSensitivePatterns: {
    /** Groups of records sharing the same (category + logicalField + valueLength + method signature) pattern. */
    groups: { patternKey: string; recordIndices: number[]; category: SensitiveCategory }[];
  };
  dataCompleteness?: {
    /** 1 - weighted average null rate across analyzed fields (0..1). */
    score: number;
    fieldsAnalyzed: number;
  };
  anomalies: AnomalyFinding[];
  profilingNotes: string[];
}

export interface ProfilingOptions {
  /** Max records to analyze for structural stats (nulls/distinct). Default: 2000 */
  maxRecordsForStructure?: number;
  /** Chunk size when iterating records. Default: 500 */
  chunkSize?: number;
  /** Max fields to emit in nullAnalysis. Default: 200 */
  maxFieldsInNullAnalysis?: number;
  /** Cap per-field distinct fingerprints. Default: 5000 */
  maxDistinctPerField?: number;
  /** Max duplicate groups to return. Default: 50 */
  maxDuplicateGroups?: number;
  flattenOptions?: DiscoveryScanOptions;
}

function logicalFieldFromPath(path: string): string {
  const p = (path ?? "").trim();
  if (!p || p === "(root)") return "root";
  const lastDot = p.lastIndexOf(".");
  const last = lastDot >= 0 ? p.slice(lastDot + 1) : p;
  return last.replace(/\[\d+\]$/g, "");
}

function fingerprintPrimitive(value: unknown): string {
  const raw = JSON.stringify({ t: typeof value, v: value });
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function patternKeyForFinding(category: SensitiveCategory, path: string, valueLength: number | undefined, methods: string[]): string {
  const field = logicalFieldFromPath(path);
  const sig = [...methods].sort().join("|");
  return `${category}::${field}::len:${valueLength ?? 0}::${sig}`;
}

export function buildProfilingReport(
  discovery: DiscoveryScanResult,
  classification: ClassificationScanResult | undefined,
  records: Record<string, unknown>[] | undefined,
  options?: ProfilingOptions
): ProfilingReport {
  const maxRecordsForStructure = options?.maxRecordsForStructure ?? 2000;
  const chunkSize = options?.chunkSize ?? 500;
  const maxFieldsInNullAnalysis = options?.maxFieldsInNullAnalysis ?? 200;
  const maxDistinctPerField = options?.maxDistinctPerField ?? 5000;
  const maxDuplicateGroups = options?.maxDuplicateGroups ?? 50;
  const flattenOpts = options?.flattenOptions;

  const totalRecords = discovery.scannedRecords;
  const profilingNotes: string[] = [];

  let sensitiveRecordCount = 0;
  let sensitiveFindings = 0;
  const fieldFindingDistribution: Record<string, number> = {};
  const patternToRecords = new Map<string, { category: SensitiveCategory; indices: Set<number> }>();

  for (const rr of discovery.findingsPerRecord) {
    if (rr.findings.length > 0) sensitiveRecordCount += 1;
    for (const f of rr.findings) {
      sensitiveFindings += 1;
      const lf = logicalFieldFromPath(f.path);
      fieldFindingDistribution[lf] = (fieldFindingDistribution[lf] ?? 0) + 1;

      const pk = patternKeyForFinding(f.category, f.path, f.valueLength, f.methods);
      const existing = patternToRecords.get(pk);
      if (!existing) {
        patternToRecords.set(pk, { category: f.category, indices: new Set([rr.recordIndex]) });
      } else {
        existing.indices.add(rr.recordIndex);
      }
    }
  }

  const duplicateSensitivePatterns = {
    groups: [...patternToRecords.entries()]
      .filter(([, v]) => v.indices.size > 1)
      .sort((a, b) => b[1].indices.size - a[1].indices.size)
      .slice(0, maxDuplicateGroups)
      .map(([patternKey, v]) => ({
        patternKey,
        recordIndices: [...v.indices].sort((x, y) => x - y),
        category: v.category
      }))
  };

  const topFieldsByFindingCount = Object.entries(fieldFindingDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([field, count]) => ({ field, count }));

  const classificationDistribution: Partial<Record<ClassificationLabel, number>> = classification?.summary
    ? { ...classification.summary }
    : {};

  const anomalies: AnomalyFinding[] = [];
  const findingsPerRecord = discovery.findingsPerRecord.map((r) => r.findings.length);
  const median =
    findingsPerRecord.length === 0
      ? 0
      : [...findingsPerRecord].sort((a, b) => a - b)[Math.floor(findingsPerRecord.length / 2)];

  for (const rr of discovery.findingsPerRecord) {
    const c = rr.findings.length;
    if (c >= Math.max(25, median * 8) && c > 0) {
      anomalies.push({
        kind: "high_finding_density_record",
        severity: c >= 50 ? "high" : "medium",
        detail: "Record has unusually high sensitive finding density versus batch median.",
        recordIndex: rr.recordIndex
      });
    }
  }

  const catTotals = discovery.summary ? { ...discovery.summary } : {};
  const dominantCategory = [...Object.entries(catTotals)].sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as
    | SensitiveCategory
    | undefined;
  const dominantShare =
    dominantCategory && sensitiveFindings > 0 ? (catTotals[dominantCategory] ?? 0) / sensitiveFindings : 0;
  if (dominantShare >= 0.85 && sensitiveFindings >= 10) {
    anomalies.push({
      kind: "category_concentration",
      severity: "low",
      detail: `A single sensitive category represents ${Math.round(dominantShare * 100)}% of findings.`
    });
  }

  if (classification) {
    const labelCount = Object.keys(classification.summary ?? {}).length;
    if (labelCount >= 5 && sensitiveRecordCount / Math.max(1, totalRecords) < 0.05) {
      anomalies.push({
        kind: "unbalanced_classification",
        severity: "low",
        detail: "Many classification labels appear while sensitive record prevalence is low; validate scan scope."
      });
    }
  }

  let nullAnalysis: FieldNullStats[] | undefined;
  let valueDistribution: FieldValueDistributionBucket[] | undefined;
  let uniqueRecordEstimate: ProfilingReport["uniqueRecordEstimate"] | undefined;
  let dataCompleteness: ProfilingReport["dataCompleteness"] | undefined;

  if (records && records.length > 0) {
    const limit = Math.min(records.length, maxRecordsForStructure, totalRecords || records.length);
    profilingNotes.push(`structure_stats_computed_for_${limit}_records`);

    const nullMap = new Map<string, { nulls: number; present: number }>();
    const distinctMap = new Map<
      string,
      { set: Set<string>; counts: Map<string, number>; capped: boolean }
    >();
    const recordHashes = new Set<string>();

    for (let start = 0; start < limit; start += chunkSize) {
      const end = Math.min(limit, start + chunkSize);
      for (let i = start; i < end; i += 1) {
        const rec = records[i];
        const fp = fingerprintPrimitive(JSON.stringify(rec));
        recordHashes.add(fp);

        const leaves = flattenRecord(rec, flattenOpts);
        for (const leaf of leaves) {
          const st = nullMap.get(leaf.path) ?? { nulls: 0, present: 0 };
          if (leaf.value === null || leaf.value === undefined) st.nulls += 1;
          else st.present += 1;
          nullMap.set(leaf.path, st);

          let bucket = distinctMap.get(leaf.path);
          if (!bucket) {
            bucket = { set: new Set<string>(), counts: new Map<string, number>(), capped: false };
            distinctMap.set(leaf.path, bucket);
          }
          if (leaf.value !== null && leaf.value !== undefined) {
            const vf = fingerprintPrimitive(leaf.value);
            if (!bucket.set.has(vf) && bucket.set.size < maxDistinctPerField) {
              bucket.set.add(vf);
            } else if (!bucket.set.has(vf) && bucket.set.size >= maxDistinctPerField) {
              bucket.capped = true;
            }
            bucket.counts.set(vf, (bucket.counts.get(vf) ?? 0) + 1);
          }
        }
      }
    }

    nullAnalysis = [...nullMap.entries()]
      .map(([path, v]) => {
        const total = v.nulls + v.present;
        const nullRate = total > 0 ? v.nulls / total : 0;
        return { path, nullCount: v.nulls, presentCount: v.present, nullRate };
      })
      .sort((a, b) => b.nullRate - a.nullRate)
      .slice(0, maxFieldsInNullAnalysis);

    valueDistribution = [...distinctMap.entries()].map(([path, b]) => {
      const topDuplicates = [...b.counts.entries()]
        .filter(([, c]) => c > 1)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 5)
        .map(([fingerprint, count]) => ({ fingerprint, count }));
      return {
        path,
        approximateDistinctValues: b.set.size,
        distinctCapped: b.capped,
        topDuplicates
      };
    });

    uniqueRecordEstimate = { uniqueCount: recordHashes.size, totalHashed: limit };

    const avgNullRate =
      nullAnalysis.length === 0
        ? 0
        : nullAnalysis.reduce((acc, f) => acc + f.nullRate, 0) / nullAnalysis.length;
    dataCompleteness = {
      score: Math.max(0, Math.min(1, 1 - avgNullRate)),
      fieldsAnalyzed: nullAnalysis.length
    };
  } else {
    profilingNotes.push("records_not_provided:null_and_duplicate_value_stats_skipped");
  }

  const sensitiveDensity: SensitiveDensityStats = {
    sensitiveFindings,
    sensitiveRecordCount,
    findingsPerSensitiveRecord: sensitiveRecordCount > 0 ? sensitiveFindings / sensitiveRecordCount : 0,
    sensitiveFindingsPerTotalRecord: totalRecords > 0 ? sensitiveFindings / totalRecords : 0
  };

  return {
    trace: discovery.trace,
    totalRecords,
    sensitiveRecordCount,
    sensitiveDensity,
    discoveryCategoryDistribution: catTotals,
    classificationDistribution,
    fieldFindingDistribution,
    sourceInsights: {
      sourceType: discovery.trace.sourceType,
      sourceName: discovery.trace.sourceName,
      entityName: discovery.trace.entityName,
      uniqueLogicalFieldsWithFindings: Object.keys(fieldFindingDistribution).length,
      topFieldsByFindingCount
    },
    nullAnalysis,
    valueDistribution,
    uniqueRecordEstimate,
    duplicateSensitivePatterns,
    dataCompleteness,
    anomalies,
    profilingNotes
  };
}
