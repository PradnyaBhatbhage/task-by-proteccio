import { env } from "../config/env";

interface DedupeEntry {
  dedupeKey: string;
  alertId: string;
  createdAt: number;
}

/**
 * In-memory dedupe registry — suppresses repeat alerts for the same logical subject within TTL.
 */
export class AlertDedupeRegistry {
  private readonly entries = new Map<string, DedupeEntry>();

  constructor(private readonly ttlMs: number) {}

  buildKey(type: string, subjectKey: string): string {
    return `${type}:${subjectKey}`;
  }

  shouldSuppress(dedupeKey: string): boolean {
    this.prune();
    const hit = this.entries.get(dedupeKey);
    if (!hit) return false;
    return Date.now() - hit.createdAt < this.ttlMs;
  }

  record(dedupeKey: string, alertId: string): void {
    this.prune();
    this.entries.set(dedupeKey, { dedupeKey, alertId, createdAt: Date.now() });
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt >= this.ttlMs) {
        this.entries.delete(key);
      }
    }
  }
}

export const alertDedupe = new AlertDedupeRegistry(env.ALERT_DEDUPE_TTL_HOURS * 60 * 60 * 1000);
