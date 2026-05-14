import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger";
import type { AuditAction, AuditLogEntry, AuditStatus } from "./types";

const MAX_ENTRIES = 5000;

function safeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
      out[k] = v;
    } else if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number")) {
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

class AuditTrail {
  private readonly entries: AuditLogEntry[] = [];

  append(input: {
    source: string;
    action: AuditAction;
    status: AuditStatus;
    durationMs: number;
    metadata?: Record<string, unknown>;
  }): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      source: input.source.slice(0, 512),
      action: input.action,
      status: input.status,
      durationMs: Math.max(0, Math.floor(input.durationMs)),
      metadata: safeMeta(input.metadata)
    };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }

    logger.info(
      {
        auditId: entry.id,
        auditAction: entry.action,
        auditStatus: entry.status,
        auditDurationMs: entry.durationMs,
        auditSource: entry.source,
        auditMeta: entry.metadata
      },
      "audit"
    );

    return entry;
  }

  list(limit = 200): AuditLogEntry[] {
    const n = Math.min(Math.max(1, limit), MAX_ENTRIES);
    return this.entries.slice(0, n);
  }

  filter(input: { action?: AuditAction; status?: AuditStatus; sourcePrefix?: string; limit?: number }): AuditLogEntry[] {
    let rows = this.entries;
    if (input.action) rows = rows.filter((e) => e.action === input.action);
    if (input.status) rows = rows.filter((e) => e.status === input.status);
    if (input.sourcePrefix) {
      const p = input.sourcePrefix.toLowerCase();
      rows = rows.filter((e) => e.source.toLowerCase().startsWith(p));
    }
    const limit = Math.min(500, Math.max(1, input.limit ?? 200));
    return rows.slice(0, limit);
  }
}

export const auditTrail = new AuditTrail();
