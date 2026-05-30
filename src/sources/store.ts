import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { publishPlatformEvent, upsertSupabaseRow } from "../supabase/client";
import type { ManagedSource, SourceConnectionSummary, SourceConnectorType, SourceStatus } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function cleanTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function sanitizeConnection(input: SourceConnectionSummary): SourceConnectionSummary {
  return {
    host: input.host?.trim(),
    port: input.port,
    database: input.database?.trim(),
    url: input.url?.trim(),
    bucket: input.bucket?.trim(),
    prefix: input.prefix?.trim(),
    fileName: input.fileName?.trim(),
    authMode: input.authMode,
    secretRef: input.secretRef?.trim()
  };
}

function initialStatus(type: SourceConnectorType, connection: SourceConnectionSummary): SourceStatus {
  if (type === "file" && connection.fileName) return "configured";
  if (type === "s3" && connection.bucket) return "configured";
  if ((type === "postgres" || type === "mysql" || type === "mongodb") && (connection.host || connection.url)) return "configured";
  if (type === "api" && connection.url) return "configured";
  return "draft";
}

export class SourceStore {
  private readonly byId = new Map<string, ManagedSource>();

  list(): ManagedSource[] {
    return [...this.byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  restore(source: ManagedSource): void {
    this.byId.set(source.id, source);
  }

  get(id: string): ManagedSource | undefined {
    return this.byId.get(id);
  }

  async create(input: {
    name: string;
    type: SourceConnectorType;
    owner?: string;
    environment?: ManagedSource["environment"];
    connection: SourceConnectionSummary;
    tags?: string[];
  }): Promise<ManagedSource> {
    const now = nowIso();
    const connection = sanitizeConnection(input.connection);
    const source: ManagedSource = {
      id: randomUUID(),
      name: input.name.trim(),
      type: input.type,
      owner: input.owner?.trim() || undefined,
      environment: input.environment ?? "development",
      status: initialStatus(input.type, connection),
      connection,
      tags: cleanTags(input.tags),
      createdAt: now,
      updatedAt: now
    };
    this.byId.set(source.id, source);
    await this.sync(source, "source.created");
    return source;
  }

  async update(
    id: string,
    patch: Partial<
      Pick<ManagedSource, "name" | "owner" | "environment" | "status" | "connection" | "tags" | "lastCheckedAt" | "lastScanAt">
    >
  ): Promise<ManagedSource | undefined> {
    const current = this.byId.get(id);
    if (!current) return undefined;

    const next: ManagedSource = {
      ...current,
      name: patch.name?.trim() || current.name,
      owner: patch.owner !== undefined ? patch.owner.trim() || undefined : current.owner,
      environment: patch.environment ?? current.environment,
      status: patch.status ?? current.status,
      connection: patch.connection ? sanitizeConnection({ ...current.connection, ...patch.connection }) : current.connection,
      tags: patch.tags ? cleanTags(patch.tags) : current.tags,
      lastCheckedAt: patch.lastCheckedAt ?? current.lastCheckedAt,
      lastScanAt: patch.lastScanAt ?? current.lastScanAt,
      updatedAt: nowIso()
    };

    this.byId.set(id, next);
    await this.sync(next, "source.updated");
    return next;
  }

  async markChecked(id: string, ok: boolean): Promise<ManagedSource | undefined> {
    return this.update(id, {
      status: ok ? "connected" : "failed",
      lastCheckedAt: nowIso()
    });
  }

  private async sync(source: ManagedSource, eventType: string): Promise<void> {
    const sync = await upsertSupabaseRow(env.SUPABASE_SOURCE_TABLE, {
      id: source.id,
      name: source.name,
      type: source.type,
      owner: source.owner ?? null,
      environment: source.environment,
      status: source.status,
      connection: source.connection,
      tags: source.tags,
      last_checked_at: source.lastCheckedAt ?? null,
      last_scan_at: source.lastScanAt ?? null,
      created_at: source.createdAt,
      updated_at: source.updatedAt
    });
    source.supabaseSync = { enabled: sync.enabled, ok: sync.ok, error: sync.error };
    void publishPlatformEvent(eventType, {
      sourceId: source.id,
      name: source.name,
      type: source.type,
      status: source.status
    });
  }
}

export const sourceStore = new SourceStore();
