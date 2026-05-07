import { NormalizedRecord } from "../types";

const fieldAliases: Record<string, string> = {
  emailaddress: "email",
  user_email: "email",
  email: "email",
  firstname: "first_name",
  first_name: "first_name",
  lastname: "last_name",
  last_name: "last_name"
};

function canonicalKey(key: string): string {
  const lowered = key.trim().toLowerCase().replace(/\s+/g, "_");
  return fieldAliases[lowered] ?? lowered;
}

export interface NormalizeOptions {
  schemaMapping?: Record<string, string>;
  flattenDelimiter?: "." | "_";
  maxFlattenDepth?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function flattenObject(
  input: Record<string, unknown>,
  delimiter: "." | "_",
  maxDepth: number
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const visit = (obj: Record<string, unknown>, prefix: string, depth: number) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}${delimiter}${k}` : k;
      if (depth < maxDepth && isPlainObject(v)) {
        visit(v, key, depth + 1);
      } else if (Array.isArray(v)) {
        out[key] = v.map((entry) => (isPlainObject(entry) ? entry : entry)).length ? JSON.stringify(v) : "[]";
      } else {
        out[key] = v;
      }
    }
  };
  visit(input, "", 0);
  return out;
}

function normalizeDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  // ISO or RFC parsable
  const direct = new Date(v);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  // yyyy-mm-dd or yyyy/mm/dd
  const ymd = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  // dd/mm/yyyy or mm/dd/yyyy (heuristic: if first part > 12 -> dd/mm)
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, a, b, y] = dmy;
    const n1 = Number(a);
    const n2 = Number(b);
    const day = n1 > 12 ? n1 : n2;
    const month = n1 > 12 ? n2 : n1;
    const dt = new Date(Date.UTC(Number(y), month - 1, day));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  return null;
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "string") {
    const v = value.trim();
    if (v === "") return null;

    const lowered = v.toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
    if (lowered === "null" || lowered === "undefined" || lowered === "n/a" || lowered === "na") return null;

    // number (avoid converting ids with leading zeros like "0012")
    if (/^-?\d+(\.\d+)?$/.test(v) && !(v.length > 1 && v.startsWith("0") && !v.startsWith("0."))) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }

    const date = normalizeDate(v);
    if (date) return date;

    return v;
  }

  return value;
}

export function normalizeRecord(record: Record<string, unknown>, options: NormalizeOptions = {}): NormalizedRecord {
  const delimiter = options.flattenDelimiter ?? ".";
  const maxDepth = options.maxFlattenDepth ?? 5;
  const flattened = flattenObject(record, delimiter, maxDepth);
  const mapping = options.schemaMapping ?? {};

  const normalized: NormalizedRecord = {};
  for (const [key, value] of Object.entries(flattened)) {
    const mapped = mapping[key] ?? mapping[canonicalKey(key)] ?? key;
    const normalizedKey = canonicalKey(mapped);
    normalized[normalizedKey] = normalizeValue(value);
  }
  return normalized;
}

export function normalizeRecords(records: Record<string, unknown>[], options: NormalizeOptions = {}): NormalizedRecord[] {
  return records.map((r) => normalizeRecord(r, options));
}
