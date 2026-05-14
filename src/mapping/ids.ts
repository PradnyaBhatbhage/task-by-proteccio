import type { SourceType } from "../discovery";
import { createHash } from "crypto";

function slugPart(s: string, max = 128): string {
  const t = (s ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (t.length <= max) return t || "unknown";
  return t.slice(0, max);
}

/** Deterministic id for a source system from type + logical name. */
export function stableSystemId(sourceType: SourceType, sourceName: string): string {
  const raw = `${sourceType}::${sourceName}`;
  return `sys_${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

/** Deterministic id for a dataset within a system. */
export function stableDatasetId(systemId: string, entityName: string): string {
  const raw = `${systemId}::${entityName}`;
  return `ds_${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}
