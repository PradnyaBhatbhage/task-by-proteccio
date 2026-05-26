import { randomUUID } from "node:crypto";
import type { ExportFormat, GenerateReportInput, ReportQuery, ReportRecord, ReportContent, ReportType } from "./types";
import { buildReportContent } from "./builders";

function nowIso(): string {
  return new Date().toISOString();
}

function fileBaseName(reportType: string, generatedAt: string): string {
  const date = generatedAt.slice(0, 10);
  return `${reportType}_${date}`;
}

function defaultTags(reportType: string): string[] {
  return ["audit-ready", reportType];
}

export class ReportStore {
  private readonly byId = new Map<string, ReportRecord>();
  private readonly byType = new Map<ReportType, Set<string>>();
  /** Newest-first report ids for fast history pagination. */
  private sortedIds: string[] = [];
  private readonly maxEntries = 2000;

  private indexAdd(record: ReportRecord): void {
    const set = this.byType.get(record.reportType) ?? new Set();
    set.add(record.id);
    this.byType.set(record.reportType, set);
    this.sortedIds = [record.id, ...this.sortedIds.filter((id) => id !== record.id)];
  }

  private indexRemove(record: ReportRecord): void {
    const set = this.byType.get(record.reportType);
    set?.delete(record.id);
    if (set?.size === 0) this.byType.delete(record.reportType);
    this.sortedIds = this.sortedIds.filter((id) => id !== record.id);
  }

  private trim(): void {
    if (this.sortedIds.length <= this.maxEntries) return;
    const drop = this.sortedIds.slice(this.maxEntries);
    for (const id of drop) {
      const rec = this.byId.get(id);
      if (rec) this.indexRemove(rec);
      this.byId.delete(id);
    }
    this.sortedIds = this.sortedIds.slice(0, this.maxEntries);
  }

  generate(input: GenerateReportInput, prebuilt?: ReportContent): ReportRecord {
    const generatedAt = nowIso();
    const content = prebuilt ?? buildReportContent(input.reportType, { generatedBy: input.generatedBy });
    const id = randomUUID();
    const tags = [...defaultTags(input.reportType), ...(input.tags ?? [])];

    const record: ReportRecord = {
      id,
      reportType: input.reportType,
      title: content.title,
      generatedAt,
      primaryFormat: input.format,
      summary: content.summary,
      tags,
      generatedBy: input.generatedBy,
      content,
      fileBaseName: fileBaseName(input.reportType, generatedAt)
    };

    this.byId.set(id, record);
    this.indexAdd(record);
    this.trim();
    return record;
  }

  get(id: string): ReportRecord | undefined {
    return this.byId.get(id);
  }

  list(): ReportRecord[] {
    return this.sortedIds.map((id) => this.byId.get(id)!).filter(Boolean);
  }

  query(q: ReportQuery): {
    items: Array<Omit<ReportRecord, "content"> & { hasContent: boolean }>;
    total: number;
    page: number;
    pageSize: number;
  } {
    const pageSize = Math.min(100, Math.max(1, Math.floor(q.pageSize ?? 25)));
    const page = Math.max(1, Math.floor(q.page ?? 1));

    let ids = this.sortedIds;
    if (q.reportType) {
      const set = this.byType.get(q.reportType);
      ids = set ? ids.filter((id) => set.has(id)) : [];
    }

    let rows = ids.map((id) => this.byId.get(id)!).filter(Boolean);

    if (q.format) {
      rows = rows.filter((r) => r.primaryFormat === q.format);
    }
    if (q.generatedFrom) {
      const from = q.generatedFrom;
      rows = rows.filter((r) => r.generatedAt >= from);
    }
    if (q.generatedTo) {
      const to = q.generatedTo;
      rows = rows.filter((r) => r.generatedAt <= to);
    }
    if (q.q) {
      const needle = q.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(needle) ||
          r.summary.toLowerCase().includes(needle) ||
          r.reportType.toLowerCase().includes(needle) ||
          r.tags.some((t) => t.toLowerCase().includes(needle)) ||
          (r.generatedBy?.toLowerCase().includes(needle) ?? false)
      );
    }

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    const items = pageRows.map(({ content: _c, ...meta }) => ({
      ...meta,
      hasContent: true
    }));

    return { items, total, page, pageSize };
  }

  clear(): void {
    this.byId.clear();
    this.byType.clear();
    this.sortedIds = [];
  }
}

export const reportStore = new ReportStore();
