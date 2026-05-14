/**
 * Derives a stable logical field key from a flattened JSON path (aligned with classification `field`).
 */
export function logicalFieldKeyFromDiscoveryPath(path: string): string {
  const p = (path ?? "").trim();
  if (!p || p === "(root)") return "root";

  const lastDot = p.lastIndexOf(".");
  const last = lastDot >= 0 ? p.slice(lastDot + 1) : p;

  if (last.startsWith("[")) return "value";
  return last.replace(/\[\d+\]$/g, "");
}
