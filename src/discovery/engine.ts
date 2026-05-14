import { analyzeLeaf, leafValueToText } from "./analyze-leaf";
import { flattenRecord } from "./flatten";
import type {
  DiscoveryScanOptions,
  DiscoveryScanRecordResult,
  DiscoveryScanResult,
  SensitiveCategory,
  SourceTrace
} from "./types";

function emptySummary(): Partial<Record<SensitiveCategory, number>> {
  return {};
}

function incrementSummary(
  summary: Partial<Record<SensitiveCategory, number>>,
  category: SensitiveCategory
): void {
  summary[category] = (summary[category] ?? 0) + 1;
}

/**
 * Scans structured records for sensitive data. Designed for batching at the caller for very large sets.
 */
export function scanRecords(
  records: Record<string, unknown>[],
  trace: Omit<SourceTrace, "recordIndex">,
  options?: DiscoveryScanOptions
): DiscoveryScanResult {
  const findingsPerRecord: DiscoveryScanRecordResult[] = [];
  const summary = emptySummary();

  records.forEach((record, recordIndex) => {
    const leaves = flattenRecord(record, options);
    const findingsForRecord: DiscoveryScanRecordResult["findings"] = [];

    for (const leaf of leaves) {
      const text = leafValueToText(leaf.value);
      if (!text) continue;
      const hits = analyzeLeaf({ path: leaf.path || "(root)", key: leaf.key, text });
      for (const f of hits) {
        findingsForRecord.push(f);
        incrementSummary(summary, f.category);
      }
    }

    findingsPerRecord.push({ recordIndex, findings: findingsForRecord });
  });

  return {
    trace: { ...trace },
    scannedRecords: records.length,
    findingsPerRecord,
    summary
  };
}

/**
 * Processes records in chunks to limit peak memory on large datasets.
 */
export async function scanRecordsBatched(
  records: Record<string, unknown>[],
  trace: Omit<SourceTrace, "recordIndex">,
  batchSize: number,
  options?: DiscoveryScanOptions,
  onBatch?: (partial: DiscoveryScanResult, batchIndex: number) => Promise<void> | void
): Promise<DiscoveryScanResult> {
  const size = Math.max(1, batchSize);
  const mergedSummary = emptySummary();
  const findingsPerRecord: DiscoveryScanRecordResult[] = [];
  let globalIndex = 0;

  for (let i = 0; i < records.length; i += size) {
    const chunk = records.slice(i, i + size);
    const batchResult = scanRecords(
      chunk,
      trace,
      options
    );

    const remapped = batchResult.findingsPerRecord.map((r) => ({
      ...r,
      recordIndex: globalIndex + r.recordIndex
    }));
    findingsPerRecord.push(...remapped);
    globalIndex += chunk.length;

    for (const [k, v] of Object.entries(batchResult.summary)) {
      const cat = k as SensitiveCategory;
      mergedSummary[cat] = (mergedSummary[cat] ?? 0) + (v ?? 0);
    }

    if (onBatch) {
      await onBatch(
        {
          trace: { ...trace },
          scannedRecords: chunk.length,
          findingsPerRecord: remapped,
          summary: batchResult.summary
        },
        Math.floor(i / size)
      );
    }
  }

  return {
    trace: { ...trace },
    scannedRecords: records.length,
    findingsPerRecord,
    summary: mergedSummary
  };
}
