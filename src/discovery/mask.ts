/**
 * Mask sensitive values for API responses and logs.
 */

export function maskMiddle(input: string, keepStart = 2, keepEnd = 2): string {
  const s = String(input);
  if (s.length <= keepStart + keepEnd) return "*".repeat(Math.min(8, s.length));
  return `${s.slice(0, keepStart)}…${s.slice(-keepEnd)}`;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return maskMiddle(email, 1, 0);
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${maskMiddle(local, 1, 1)}@${domain.length > 3 ? maskMiddle(domain, 1, 2) : "***"}`;
}

/** Mask a single string value for safe API previews (never return raw PII). */
export function maskValueForPreview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return maskEmail(trimmed);
  }
  if (trimmed.length <= 4) return "****";
  return maskMiddle(trimmed, 2, 2);
}

function maskPreviewValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") return maskValueForPreview(val);
  if (typeof val === "number" || typeof val === "boolean") return val;
  if (Array.isArray(val)) return val.map(maskPreviewValue);
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = maskPreviewValue(v);
    return out;
  }
  return "[redacted]";
}

/** Mask all string fields in records returned from ingestion previews. */
export function maskRecordsForPreview(records: Record<string, unknown>[]): Record<string, unknown>[] {
  return records.map((r) => maskPreviewValue(r) as Record<string, unknown>);
}
