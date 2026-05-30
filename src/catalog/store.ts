import type { ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult } from "../discovery";
import { mappingRegistry, stableDatasetId, stableSystemId } from "../mapping";
import { buildProfilingReport, type ProfilingOptions } from "../profiling";
import { assessRisk, mergeExposureHintsForDiscovery, type RiskExposureHints } from "../risk";
import type { RiskLevel } from "../risk/types";
import { invalidateDashboardCache } from "../services/dashboard-analytics-cache";
import { persistCatalogSnapshot } from "../supabase/governance-persistence";
import type { CatalogQuery, GovernanceDatasetSnapshot } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function sourceKey(trace: GovernanceDatasetSnapshot["trace"]): string {
  return `${trace.sourceType}::${trace.sourceName}`;
}

export class GovernanceCatalog {
  private readonly byDatasetId = new Map<string, GovernanceDatasetSnapshot>();
  private readonly byRiskLevel = new Map<RiskLevel, Set<string>>();
  private readonly bySourceType = new Map<string, Set<string>>();
  private readonly bySourceKey = new Map<string, Set<string>>();
  private _revision = 0;

  /** Bumps when catalog content changes (used for aggregate cache invalidation). */
  get revision(): number {
    return this._revision;
  }

  get size(): number {
    return this.byDatasetId.size;
  }

  private bumpRevision(): void {
    this._revision += 1;
    invalidateDashboardCache();
  }

  private indexAdd(snap: GovernanceDatasetSnapshot): void {
    this.addToSet(this.byRiskLevel, snap.riskLevel, snap.datasetId);
    this.addToSet(this.bySourceType, snap.trace.sourceType, snap.datasetId);
    this.addToSet(this.bySourceKey, sourceKey(snap.trace), snap.datasetId);
  }

  private indexRemove(snap: GovernanceDatasetSnapshot): void {
    this.removeFromSet(this.byRiskLevel, snap.riskLevel, snap.datasetId);
    this.removeFromSet(this.bySourceType, snap.trace.sourceType, snap.datasetId);
    this.removeFromSet(this.bySourceKey, sourceKey(snap.trace), snap.datasetId);
  }

  restore(snapshot: GovernanceDatasetSnapshot): void {
    const prev = this.byDatasetId.get(snapshot.datasetId);
    if (prev) this.indexRemove(prev);
    this.byDatasetId.set(snapshot.datasetId, snapshot);
    this.indexAdd(snapshot);
    this.bumpRevision();
  }

  private addToSet(map: Map<string, Set<string>>, key: string, id: string): void {
    const set = map.get(key) ?? new Set();
    set.add(id);
    map.set(key, set);
  }

  private removeFromSet(map: Map<string, Set<string>>, key: string, id: string): void {
    const set = map.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) map.delete(key);
  }

  private idsForRiskLevel(level: RiskLevel): string[] | undefined {
    const set = this.byRiskLevel.get(level);
    return set ? [...set] : undefined;
  }

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
    const mergedHints = mergeExposureHintsForDiscovery(discovery, exposureHints, profile);
    const risk = assessRisk(discovery, classification, mergedHints, profile);

    const mapped = mappingRegistry.listDatasets().some((d) => d.id === datasetId);

    const prev = this.byDatasetId.get(datasetId);
    if (prev) this.indexRemove(prev);

    const snap: GovernanceDatasetSnapshot = {
      datasetId,
      systemId,
      trace: discovery.trace,
      createdAt: prev?.createdAt ?? nowIso(),
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
    this.indexAdd(snap);
    this.bumpRevision();
    void persistCatalogSnapshot(snap);
    return snap;
  }

  /** Refresh `mapped` flags from the current mapping registry (in-memory). */
  refreshMappedFlags(): void {
    const ids = new Set(mappingRegistry.listDatasets().map((d) => d.id));
    let changed = false;
    for (const [id, snap] of this.byDatasetId) {
      const next = ids.has(id);
      if (snap.mapped !== next) {
        snap.mapped = next;
        snap.updatedAt = nowIso();
        this.byDatasetId.set(id, snap);
        changed = true;
      }
    }
    if (changed) this.bumpRevision();
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
      const ids = this.idsForRiskLevel(q.riskLevel);
      if (ids) {
        const idSet = new Set(ids);
        rows = rows.filter((r) => idSet.has(r.datasetId));
      } else {
        rows = [];
      }
    }
    if (q.sourceType) {
      const set = this.bySourceType.get(q.sourceType);
      if (set) {
        const idSet = set;
        rows = rows.filter((r) => idSet.has(r.datasetId));
      } else {
        rows = [];
      }
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
    this.byRiskLevel.clear();
    this.bySourceType.clear();
    this.bySourceKey.clear();
    this.bumpRevision();
  }
}

export const governanceCatalog = new GovernanceCatalog();
