import { randomUUID } from "node:crypto";
import type {
  AlertEvent,
  AlertQuery,
  AlertStatus,
  EmailOutboxEntry,
  EnqueueAlertInput,
  InAppNotification,
  NotificationChannel,
  NotificationQuery
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export class AlertStore {
  private readonly alerts = new Map<string, AlertEvent>();
  private readonly notifications = new Map<string, InAppNotification>();
  private readonly emailOutbox: EmailOutboxEntry[] = [];

  createPending(input: EnqueueAlertInput, dedupeKey: string, channels: NotificationChannel[]): AlertEvent {
    const id = randomUUID();
    const event: AlertEvent = {
      id,
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      subjectKey: input.subjectKey,
      datasetId: input.datasetId,
      source: input.source,
      metadata: input.metadata ?? {},
      status: "pending",
      channels,
      createdAt: nowIso(),
      dedupeKey
    };
    this.alerts.set(id, event);
    return event;
  }

  markSuppressed(id: string): void {
    const a = this.alerts.get(id);
    if (!a) return;
    a.status = "suppressed";
    this.alerts.set(id, a);
  }

  markQueued(id: string): void {
    const a = this.alerts.get(id);
    if (!a) return;
    a.status = "queued";
    this.alerts.set(id, a);
  }

  markDelivered(id: string): void {
    const a = this.alerts.get(id);
    if (!a) return;
    a.status = "delivered";
    a.deliveredAt = nowIso();
    this.alerts.set(id, a);
  }

  markFailed(id: string): void {
    const a = this.alerts.get(id);
    if (!a) return;
    a.status = "failed";
    this.alerts.set(id, a);
  }

  get(id: string): AlertEvent | undefined {
    return this.alerts.get(id);
  }

  listAlerts(q: AlertQuery): { items: AlertEvent[]; total: number; page: number; pageSize: number } {
    const pageSize = Math.min(200, Math.max(1, Math.floor(q.pageSize ?? 25)));
    const page = Math.max(1, Math.floor(q.page ?? 1));

    let rows = [...this.alerts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (q.type) rows = rows.filter((r) => r.type === q.type);
    if (q.severity) rows = rows.filter((r) => r.severity === q.severity);
    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.datasetId) rows = rows.filter((r) => r.datasetId === q.datasetId);

    const total = rows.length;
    const start = (page - 1) * pageSize;
    return { items: rows.slice(start, start + pageSize), total, page, pageSize };
  }

  addNotification(alert: AlertEvent): InAppNotification {
    const n: InAppNotification = {
      id: randomUUID(),
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      read: false,
      createdAt: nowIso(),
      datasetId: alert.datasetId
    };
    this.notifications.set(n.id, n);
    return n;
  }

  listNotifications(q: NotificationQuery): {
    items: InAppNotification[];
    total: number;
    unreadCount: number;
    page: number;
    pageSize: number;
  } {
    const pageSize = Math.min(200, Math.max(1, Math.floor(q.pageSize ?? 25)));
    const page = Math.max(1, Math.floor(q.page ?? 1));

    let rows = [...this.notifications.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (q.unreadOnly) rows = rows.filter((r) => !r.read);
    if (q.type) rows = rows.filter((r) => r.type === q.type);

    const unreadCount = [...this.notifications.values()].filter((n) => !n.read).length;
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return { items: rows.slice(start, start + pageSize), total, unreadCount, page, pageSize };
  }

  markNotificationRead(id: string): InAppNotification | undefined {
    const n = this.notifications.get(id);
    if (!n) return undefined;
    n.read = true;
    this.notifications.set(id, n);
    return n;
  }

  markAllNotificationsRead(): number {
    let count = 0;
    for (const n of this.notifications.values()) {
      if (!n.read) {
        n.read = true;
        count += 1;
      }
    }
    return count;
  }

  pushEmailOutbox(entry: Omit<EmailOutboxEntry, "id" | "createdAt">): EmailOutboxEntry {
    const row: EmailOutboxEntry = {
      id: randomUUID(),
      createdAt: nowIso(),
      ...entry
    };
    this.emailOutbox.unshift(row);
    if (this.emailOutbox.length > 500) this.emailOutbox.length = 500;
    return row;
  }

  listEmailOutbox(limit = 50): EmailOutboxEntry[] {
    return this.emailOutbox.slice(0, limit);
  }

  stats(): Record<AlertStatus, number> & { byType: Record<string, number> } {
    const byStatus: Record<AlertStatus, number> = {
      pending: 0,
      queued: 0,
      delivered: 0,
      suppressed: 0,
      failed: 0
    };
    const byType: Record<string, number> = {};
    for (const a of this.alerts.values()) {
      byStatus[a.status] += 1;
      byType[a.type] = (byType[a.type] ?? 0) + 1;
    }
    return { ...byStatus, byType };
  }

  clear(): void {
    this.alerts.clear();
    this.notifications.clear();
    this.emailOutbox.length = 0;
  }
}

export const alertStore = new AlertStore();
