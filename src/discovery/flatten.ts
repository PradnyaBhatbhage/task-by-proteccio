import type { DiscoveryScanOptions } from "./types";

const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_LEAVES = 50_000;

export interface FlatLeaf {
  /** JSON path */
  path: string;
  /** Last segment key (useful for keyword rules). */
  key: string;
  value: unknown;
}

function appendPath(base: string, segment: string): string {
  if (!base) return segment;
  if (segment.startsWith("[")) return `${base}${segment}`;
  return `${base}.${segment}`;
}

/**
 * Flattens nested objects and arrays into leaf paths for scanning.
 * Does not stringify blobs; non-json primitives become single leaves.
 */
export function flattenRecord(
  root: Record<string, unknown>,
  options?: DiscoveryScanOptions
): FlatLeaf[] {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxLeaves = options?.maxLeavesPerRecord ?? DEFAULT_MAX_LEAVES;
  const out: FlatLeaf[] = [];

  const walk = (value: unknown, path: string, depth: number, key: string): void => {
    if (out.length >= maxLeaves) return;
    if (depth > maxDepth) {
      out.push({ path, key, value });
      return;
    }

    if (value === null || value === undefined) {
      out.push({ path, key, value });
      return;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out.push({ path, key, value });
      return;
    }

    if (typeof value === "bigint") {
      out.push({ path, key, value: value.toString() });
      return;
    }

    if (value instanceof Date) {
      out.push({ path, key, value: value.toISOString() });
      return;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        out.push({ path, key, value });
        return;
      }
      for (let i = 0; i < value.length; i += 1) {
        if (out.length >= maxLeaves) return;
        const seg = `[${i}]`;
        walk(value[i], appendPath(path, seg), depth + 1, String(i));
      }
      return;
    }

    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        out.push({ path, key, value });
        return;
      }
      for (const [k, v] of entries) {
        if (out.length >= maxLeaves) return;
        walk(v, appendPath(path, k), depth + 1, k);
      }
      return;
    }

    out.push({ path, key, value });
  };

  walk(root, "", 0, "");
  return out;
}
