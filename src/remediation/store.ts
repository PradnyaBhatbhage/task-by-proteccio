import { randomUUID } from "node:crypto";
import type {
  CreateRemediationInput,
  RemediationHistoryAction,
  RemediationHistoryEntry,
  RemediationQuery,
  RemediationTicket,
  RemediationStatus,
  UpdateRemediationInput
} from "./types";
import type { RiskLevel } from "../risk/types";
import { invalidateDashboardCache } from "../services/dashboard-analytics-cache";

function nowIso(): string {
  return new Date().toISOString();
}

function safeDetails(meta: Record<string, unknown>): RemediationHistoryEntry["details"] {
  const out: RemediationHistoryEntry["details"] = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
      out[k] = v;
    }
  }
  return out;
}

export class RemediationStore {
  private readonly byId = new Map<string, RemediationTicket>();
  private readonly byStatus = new Map<RemediationStatus, Set<string>>();
  private readonly bySeverity = new Map<RiskLevel, Set<string>>();
  private readonly byDatasetId = new Map<string, Set<string>>();

  private indexAdd(ticket: RemediationTicket): void {
    this.addToSet(this.byStatus, ticket.status, ticket.id);
    this.addToSet(this.bySeverity, ticket.severity, ticket.id);
    if (ticket.datasetId) this.addToSet(this.byDatasetId, ticket.datasetId, ticket.id);
  }

  private indexRemove(ticket: RemediationTicket): void {
    this.removeFromSet(this.byStatus, ticket.status, ticket.id);
    this.removeFromSet(this.bySeverity, ticket.severity, ticket.id);
    if (ticket.datasetId) this.removeFromSet(this.byDatasetId, ticket.datasetId, ticket.id);
  }

  private addToSet<K>(map: Map<K, Set<string>>, key: K, id: string): void {
    const set = map.get(key) ?? new Set();
    set.add(id);
    map.set(key, set);
  }

  private removeFromSet<K>(map: Map<K, Set<string>>, key: K, id: string): void {
    const set = map.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) map.delete(key);
  }

  private invalidateCaches(): void {
    invalidateDashboardCache();
  }

  create(input: CreateRemediationInput): RemediationTicket {
    const id = randomUUID();
    const ts = nowIso();
    const status = input.status ?? "open";
    const history: RemediationHistoryEntry[] = [
      {
        id: randomUUID(),
        timestamp: ts,
        action: "created",
        actor: input.assignedUser,
        details: safeDetails({
          severity: input.severity,
          status,
          source: input.source,
          riskType: input.riskType,
          datasetId: input.datasetId ?? null
        })
      }
    ];

    const ticket: RemediationTicket = {
      id,
      source: input.source,
      riskType: input.riskType,
      classificationCategory: input.classificationCategory,
      suggestedAction: input.suggestedAction,
      assignedUser: input.assignedUser,
      resolutionNotes: input.resolutionNotes,
      severity: input.severity,
      status,
      createdAt: ts,
      updatedAt: ts,
      datasetId: input.datasetId,
      history
    };

    this.byId.set(id, ticket);
    this.indexAdd(ticket);
    this.invalidateCaches();
    return ticket;
  }

  get(id: string): RemediationTicket | undefined {
    return this.byId.get(id);
  }

  list(): RemediationTicket[] {
    return [...this.byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Indexed lookup by status (e.g. open, in_progress). */
  listByStatus(status: RemediationStatus): RemediationTicket[] {
    const ids = this.byStatus.get(status);
    if (!ids) return [];
    return [...ids].map((id) => this.byId.get(id)!).filter(Boolean);
  }

  update(id: string, input: UpdateRemediationInput, actor?: string): RemediationTicket | undefined {
    const existing = this.byId.get(id);
    if (!existing) return undefined;

    this.indexRemove(existing);

    const ts = nowIso();
    const prevStatus = existing.status;
    const changes: Record<string, unknown> = {};

    if (input.source !== undefined && input.source !== existing.source) {
      existing.source = input.source;
      changes.source = input.source;
    }
    if (input.riskType !== undefined && input.riskType !== existing.riskType) {
      existing.riskType = input.riskType;
      changes.riskType = input.riskType;
    }
    if (input.classificationCategory !== undefined && input.classificationCategory !== existing.classificationCategory) {
      existing.classificationCategory = input.classificationCategory;
      changes.classificationCategory = input.classificationCategory;
    }
    if (input.suggestedAction !== undefined && input.suggestedAction !== existing.suggestedAction) {
      existing.suggestedAction = input.suggestedAction;
      changes.suggestedAction = input.suggestedAction;
    }
    if (input.severity !== undefined && input.severity !== existing.severity) {
      existing.severity = input.severity;
      changes.severity = input.severity;
    }
    if (input.assignedUser !== undefined) {
      const next = input.assignedUser === null ? undefined : input.assignedUser;
      if (next !== existing.assignedUser) {
        existing.assignedUser = next;
        changes.assignedUser = next ?? null;
        this.appendHistory(existing, "assigned", actor, { assignedUser: next ?? null });
      }
    }
    if (input.resolutionNotes !== undefined) {
      const next = input.resolutionNotes === null ? undefined : input.resolutionNotes;
      if (next !== existing.resolutionNotes) {
        existing.resolutionNotes = next;
        changes.resolutionNotes = next ? "(updated)" : null;
      }
    }
    if (input.status !== undefined && input.status !== existing.status) {
      existing.status = input.status;
      changes.status = input.status;
      const action: RemediationHistoryAction =
        input.status === "resolved" ? "resolved" : input.status === "closed" ? "closed" : "status_changed";
      this.appendHistory(existing, action, actor, {
        from: prevStatus,
        to: input.status
      });
    }

    if (Object.keys(changes).length > 0 && !changes.status && !changes.assignedUser) {
      this.appendHistory(existing, "updated", actor, safeDetails(changes));
    }

    existing.updatedAt = ts;
    this.byId.set(id, existing);
    this.indexAdd(existing);
    this.invalidateCaches();
    return existing;
  }

  query(q: RemediationQuery): { items: RemediationTicket[]; total: number; page: number; pageSize: number } {
    const pageSize = Math.min(200, Math.max(1, Math.floor(q.pageSize ?? 25)));
    const page = Math.max(1, Math.floor(q.page ?? 1));

    let rows = this.list();

    if (q.unresolved) {
      const open = this.byStatus.get("open") ?? new Set();
      const inProg = this.byStatus.get("in_progress") ?? new Set();
      const idSet = new Set([...open, ...inProg]);
      rows = rows.filter((r) => idSet.has(r.id));
    } else if (q.status) {
      const set = this.byStatus.get(q.status);
      rows = set ? rows.filter((r) => set.has(r.id)) : [];
    }
    if (q.severity) {
      const set = this.bySeverity.get(q.severity);
      rows = set ? rows.filter((r) => set.has(r.id)) : [];
    }
    if (q.datasetId) {
      const set = this.byDatasetId.get(q.datasetId);
      rows = set ? rows.filter((r) => set.has(r.id)) : [];
    }
    if (q.q) {
      const needle = q.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.source.toLowerCase().includes(needle) ||
          r.riskType.toLowerCase().includes(needle) ||
          r.suggestedAction.toLowerCase().includes(needle) ||
          r.classificationCategory.toLowerCase().includes(needle) ||
          (r.assignedUser?.toLowerCase().includes(needle) ?? false) ||
          (r.resolutionNotes?.toLowerCase().includes(needle) ?? false)
      );
    }

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);
    return { items, total, page, pageSize };
  }

  history(id: string): RemediationHistoryEntry[] | undefined {
    const ticket = this.byId.get(id);
    return ticket ? [...ticket.history] : undefined;
  }

  clear(): void {
    this.byId.clear();
    this.byStatus.clear();
    this.bySeverity.clear();
    this.byDatasetId.clear();
    this.invalidateCaches();
  }

  private appendHistory(
    ticket: RemediationTicket,
    action: RemediationHistoryAction,
    actor: string | undefined,
    details: Record<string, unknown>
  ): void {
    ticket.history.unshift({
      id: randomUUID(),
      timestamp: nowIso(),
      action,
      actor,
      details: safeDetails(details)
    });
    if (ticket.history.length > 100) {
      ticket.history.length = 100;
    }
  }
}

export const remediationStore = new RemediationStore();
