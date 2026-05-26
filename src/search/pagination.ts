import type { PaginatedResult, SearchSortField, SortOrder } from "./types";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

export function clampPageSize(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(raw)));
}

export function clampPage(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 1;
  return Math.max(1, Math.floor(raw));
}

export interface CursorPayload {
  sortBy: SearchSortField;
  sortOrder: SortOrder;
  sortValue: string | number;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined): CursorPayload | undefined {
  if (!raw) return undefined;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as CursorPayload;
    if (typeof parsed.id !== "string" || parsed.sortBy === undefined) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function paginateSlice<T>(
  rows: T[],
  opts: {
    page?: number;
    pageSize?: number;
    cursor?: CursorPayload;
    getCursorPayload: (item: T) => CursorPayload | undefined;
    sortBy?: SearchSortField;
    sortOrder?: SortOrder;
  }
): PaginatedResult<T> {
  const pageSize = clampPageSize(opts.pageSize);
  let working = rows;

  if (opts.cursor) {
    const c = opts.cursor;
    const idx = working.findIndex((item) => {
      const payload = opts.getCursorPayload(item);
      if (!payload) return false;
      if (payload.id !== c.id) return false;
      return String(payload.sortValue) === String(c.sortValue);
    });
    if (idx >= 0) {
      working = working.slice(idx + 1);
    }
  }

  const total = rows.length;
  const page = clampPage(opts.page);
  const start = opts.cursor ? 0 : (page - 1) * pageSize;
  const items = working.slice(start, start + pageSize);
  const hasMore = start + items.length < working.length;

  let nextCursor: string | undefined;
  const last = items[items.length - 1];
  if (last && hasMore) {
    const payload = opts.getCursorPayload(last);
    if (payload) nextCursor = encodeCursor(payload);
  }

  return {
    items,
    total,
    page: opts.cursor ? page : page,
    pageSize,
    sortBy: opts.sortBy,
    sortOrder: opts.sortOrder,
    nextCursor,
    hasMore
  };
}
