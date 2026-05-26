import { governanceCatalog } from "../catalog";
import { mappingRegistry } from "../mapping";
import type { MappedField, SourceSystem } from "../mapping/types";
import { remediationStore } from "../remediation";
import type { RemediationTicket } from "../remediation/types";
import { ALL_REGULATIONS } from "../risk";
import { decodeCursor, paginateSlice } from "./pagination";
import { datasetCursorPayload, filterDatasets, matchesKeyword, sortDatasets } from "./filters";
import type {
  DatasetSearchQuery,
  DatasetSearchResult,
  GlobalSearchQuery,
  GlobalSearchResult,
  LineageSearchHit,
  LineageSearchQuery,
  LineageSearchResult,
  RemediationSearchQuery,
  RemediationSearchResult
} from "./types";

export { ALL_REGULATIONS };

export function searchDatasets(q: DatasetSearchQuery): DatasetSearchResult {
  governanceCatalog.refreshMappedFlags();
  let rows = governanceCatalog.list();
  rows = filterDatasets(rows, q);

  const sortBy = q.sortBy ?? "updatedAt";
  const sortOrder = q.sortOrder ?? "desc";
  rows = sortDatasets(rows, sortBy, sortOrder);

  const cursor = decodeCursor(q.cursor);
  const result = paginateSlice(rows, {
    page: q.page,
    pageSize: q.pageSize,
    cursor: cursor ? { ...cursor, sortBy: cursor.sortBy ?? sortBy, sortOrder: cursor.sortOrder ?? sortOrder } : undefined,
    sortBy,
    sortOrder,
    getCursorPayload: (item) => datasetCursorPayload(item, sortBy)
  });

  return result;
}

function remediationMatchesKeyword(ticket: RemediationTicket, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  return (
    ticket.source.toLowerCase().includes(needle) ||
    ticket.riskType.toLowerCase().includes(needle) ||
    ticket.suggestedAction.toLowerCase().includes(needle) ||
    ticket.classificationCategory.toLowerCase().includes(needle) ||
    (ticket.assignedUser?.toLowerCase().includes(needle) ?? false) ||
    (ticket.resolutionNotes?.toLowerCase().includes(needle) ?? false) ||
    (ticket.datasetId?.toLowerCase().includes(needle) ?? false)
  );
}

const SEVERITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

export function searchRemediation(q: RemediationSearchQuery): RemediationSearchResult {
  let rows = remediationStore.list();

  if (q.unresolved) {
    rows = rows.filter((t) => t.status === "open" || t.status === "in_progress");
  } else if (q.status) {
    rows = rows.filter((t) => t.status === q.status);
  }
  if (q.severity) {
    rows = rows.filter((t) => t.severity === q.severity);
  }
  if (q.datasetId) {
    rows = rows.filter((t) => t.datasetId === q.datasetId);
  }
  if (q.keyword) {
    rows = rows.filter((t) => remediationMatchesKeyword(t, q.keyword!));
  }

  const sortBy = q.sortBy ?? "updatedAt";
  const sortOrder = q.sortOrder ?? "desc";
  const dir = sortOrder === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "severity") {
      cmp = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    } else if (sortBy === "createdAt") {
      cmp = a.createdAt.localeCompare(b.createdAt);
    } else {
      cmp = a.updatedAt.localeCompare(b.updatedAt);
    }
    if (cmp === 0) cmp = a.id.localeCompare(b.id);
    return cmp * dir;
  });

  const cursor = decodeCursor(q.cursor);
  return paginateSlice(rows, {
    page: q.page,
    pageSize: q.pageSize,
    cursor,
    sortBy: undefined,
    sortOrder,
    getCursorPayload: (item) => ({
      sortBy: "updatedAt",
      sortOrder,
      sortValue: item.updatedAt,
      id: item.id
    })
  });
}

export function searchLineage(q: LineageSearchQuery): LineageSearchResult {
  const hits: LineageSearchHit[] = [];
  const needle = q.relatedSourceName?.toLowerCase();

  const datasetIds: string[] = [];
  if (q.datasetId) {
    datasetIds.push(q.datasetId);
  } else if (q.systemId) {
    for (const d of mappingRegistry.listDatasets()) {
      if (d.systemId === q.systemId) datasetIds.push(d.id);
    }
  } else {
    datasetIds.push(...mappingRegistry.listDatasets().map((d) => d.id));
  }

  const direction = q.direction ?? "both";

  for (const anchorId of datasetIds) {
    const view = mappingRegistry.getDatasetLineage(anchorId);
    if (!view) continue;

    let matchedHopCount = 0;
    const hops =
      direction === "upstream"
        ? view.upstream
        : direction === "downstream"
          ? view.downstream
          : [...view.upstream, ...view.downstream];

    for (const hop of hops) {
      if (q.flowKind && hop.flowKind !== q.flowKind) continue;
      matchedHopCount += 1;
    }

    if (q.flowKind && matchedHopCount === 0) continue;

    if (needle) {
      const relatedIds = new Set<string>();
      for (const hop of hops) {
        relatedIds.add(hop.fromDatasetId);
        relatedIds.add(hop.toDatasetId);
      }
      let nameMatch = false;
      for (const id of relatedIds) {
        const ds = mappingRegistry.listDatasets().find((d) => d.id === id);
        const sys = ds ? mappingRegistry.listSystems().find((s) => s.id === ds.systemId) : undefined;
        if (
          ds?.entityName.toLowerCase().includes(needle) ||
          sys?.sourceName.toLowerCase().includes(needle)
        ) {
          nameMatch = true;
          break;
        }
      }
      if (!nameMatch && !view.system.sourceName.toLowerCase().includes(needle)) continue;
    }

    hits.push({ anchorDatasetId: anchorId, view, matchedHopCount });
  }

  hits.sort((a, b) => b.matchedHopCount - a.matchedHopCount || a.anchorDatasetId.localeCompare(b.anchorDatasetId));

  const page = Math.max(1, Math.floor(q.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(q.pageSize ?? 25)));
  const total = hits.length;
  const start = (page - 1) * pageSize;
  const items = hits.slice(start, start + pageSize);

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total
  };
}

function fieldMatchesKeyword(field: MappedField, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  return (
    field.logicalFieldKey.toLowerCase().includes(needle) ||
    field.jsonPath.toLowerCase().includes(needle) ||
    field.sensitiveCategory.toLowerCase().includes(needle) ||
    field.datasetId.toLowerCase().includes(needle) ||
    (field.privacyLabels?.some((l) => l.toLowerCase().includes(needle)) ?? false)
  );
}

function sourceMatchesKeyword(sys: SourceSystem, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  return sys.sourceName.toLowerCase().includes(needle) || sys.sourceType.toLowerCase().includes(needle) || sys.id.toLowerCase().includes(needle);
}

function paginateBucket<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize
  };
}

export function searchGlobal(q: GlobalSearchQuery): GlobalSearchResult {
  const keyword = q.keyword.trim();
  const types = new Set(q.types ?? ["datasets", "fields", "remediation", "lineage", "sources"]);
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(q.pageSize ?? 10)));

  const datasets = types.has("datasets")
    ? paginateBucket(
        filterDatasets(governanceCatalog.list(), { keyword }),
        page,
        pageSize
      )
    : { items: [], total: 0, page, pageSize };

  const fields = types.has("fields")
    ? paginateBucket(mappingRegistry.listFields().filter((f) => fieldMatchesKeyword(f, keyword)), page, pageSize)
    : { items: [], total: 0, page, pageSize };

  const remediation = types.has("remediation")
    ? paginateBucket(remediationStore.list().filter((t) => remediationMatchesKeyword(t, keyword)), page, pageSize)
    : { items: [], total: 0, page, pageSize };

  const lineage = types.has("lineage")
    ? paginateBucket(searchLineage({ relatedSourceName: keyword, page: 1, pageSize: 500 }).items, page, pageSize)
    : { items: [], total: 0, page, pageSize };

  const sources = types.has("sources")
    ? paginateBucket(mappingRegistry.listSystems().filter((s) => sourceMatchesKeyword(s, keyword)), page, pageSize)
    : { items: [], total: 0, page, pageSize };

  return { query: keyword, datasets, fields, remediation, lineage, sources };
}
