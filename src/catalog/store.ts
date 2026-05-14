import type { ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult } from "../discovery";
import { mappingRegistry, stableDatasetId, stableSystemId } from "../mapping";
import { buildProfilingReport, type ProfilingOptions } from "../profiling";
import { assessRisk, mergeExposureHintsForDiscovery, type RiskExposureHints } from "../risk";
import type { CatalogQuery, GovernanceDatasetSnapshot } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export class GovernanceCatalog {
  private readonly byDatasetId = new Map<string, GovernanceDatasetSnapshot>();

  upsertFromScan(input: {
    discovery: DiscoveryScanResult;
    classification?: ClassificationScanResult;
    records?: Record<string, unknown>[];
    profilingOptions?: ProfilingOptions;
    exposureHints?: RiskExposureHints;
  }): GovernanceDatasetSnapshot {
    const { discovery, classification, records, profilingOptions, exposureHints } = input;
    const systemId = stableSystemId(discovery.trace.sourceType, discovery.trace.sourceName);
    const datasetId = stableDatasetId(systemId, discovery.trace.entityName);

    const profile = buildProfilingReport(discovery, classification, records, profilingOptions);
    const mergedHints = mergeExposureHintsForDiscovery(discovery, exposureHints);
    const risk = assessRisk(discovery, classification, mergedHints);

    const mapped = mappingRegistry.listDatasets().some((d) => d.id === datasetId);

    const snap: GovernanceDatasetSnapshot = {
      datasetId,
      systemId,
      trace: discovery.trace,
      createdAt: this.byDatasetId.get(datasetId)?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      profile,
      risk,
      discoveryCategoryTotals: { ...discovery.summary },
      classificationTotals: classification ? { ...classification.summary } : {},
      sensitiveRecordCount: profile.sensitiveRecordCount,
      totalRecords: profile.totalRecords,
      riskLevel: risk.level,
      mapped
    };

    this.byDatasetId.set(datasetId, snap);
    return snap;
  }

  /** Refresh `mapped` flags from the current mapping registry (in-memory). */
  refreshMappedFlags(): void {
    const ids = new Set(mappingRegistry.listDatasets().map((d) => d.id));
    for (const [id, snap] of this.byDatasetId) {
      snap.mapped = ids.has(id);
      snap.updatedAt = nowIso();
      this.byDatasetId.set(id, snap);
    }
  }

  get(datasetId: string): GovernanceDatasetSnapshot | undefined {
    return this.byDatasetId.get(datasetId);
  }

  list(): GovernanceDatasetSnapshot[] {
    return [...this.byDatasetId.values()].sort((a, b) => a.datasetId.localeCompare(b.datasetId));
  }

  query(q: CatalogQuery): { items: GovernanceDatasetSnapshot[]; total: number; page: number; pageSize: number } {
    this.refreshMappedFlags();
    const pageSize = Math.min(200, Math.max(1, Math.floor(q.pageSize ?? 25)));
    const page = Math.max(1, Math.floor(q.page ?? 1));

    let rows = this.list();

    if (q.riskLevel) {
      rows = rows.filter((r) => r.riskLevel === q.riskLevel);
    }
    if (q.sourceType) {
      rows = rows.filter((r) => r.trace.sourceType === q.sourceType);
    }
    if (q.sourceNameContains) {
      const needle = q.sourceNameContains.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.trace.sourceName.toLowerCase().includes(needle) || r.trace.entityName.toLowerCase().includes(needle)
      );
    }
    if (q.classificationLabel) {
      rows = rows.filter((r) => (r.classificationTotals[q.classificationLabel!] ?? 0) > 0);
    }
    if (q.detectionCategory) {
      rows = rows.filter((r) => (r.discoveryCategoryTotals[q.detectionCategory!] ?? 0) > 0);
    }
    if (q.mappedOnly) {
      rows = rows.filter((r) => r.mapped);
    }

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);
    return { items, total, page, pageSize };
  }

  clear(): void {
    this.byDatasetId.clear();
  }
}

export const governanceCatalog = new GovernanceCatalog();
