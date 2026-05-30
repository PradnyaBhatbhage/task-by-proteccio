import { env } from "../config/env";
import type { AlertEvent, EmailOutboxEntry, InAppNotification } from "../alerting/types";
import type { AuditLogEntry } from "../audit/types";
import type { GovernanceDatasetSnapshot } from "../catalog/types";
import type { MappingInventoryExport } from "../mapping/types";
import type { RemediationTicket } from "../remediation/types";
import type { ReportRecord } from "../reporting/types";
import { publishPlatformEvent, upsertSupabaseRow, type SupabaseSyncResult } from "./client";

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : "Supabase persistence failed";
}

async function persistRow(
  table: string,
  row: Record<string, unknown>,
  eventType: string,
  eventPayload: Record<string, unknown>
): Promise<SupabaseSyncResult> {
  try {
    const result = await upsertSupabaseRow(table, row);
    if (result.ok) {
      void publishPlatformEvent(eventType, eventPayload);
    }
    return result;
  } catch (err) {
    return { enabled: true, ok: false, table, error: safeError(err) };
  }
}

export function persistCatalogSnapshot(snapshot: GovernanceDatasetSnapshot): Promise<SupabaseSyncResult> {
  return persistRow(
    env.SUPABASE_CATALOG_TABLE,
    {
      id: snapshot.datasetId,
      dataset_id: snapshot.datasetId,
      system_id: snapshot.systemId,
      source_type: snapshot.trace.sourceType,
      source_name: snapshot.trace.sourceName,
      entity_name: snapshot.trace.entityName,
      risk_level: snapshot.riskLevel,
      total_records: snapshot.totalRecords,
      sensitive_records: snapshot.sensitiveRecordCount,
      mapped: snapshot.mapped,
      discovery_summary: snapshot.discoveryCategoryTotals,
      classification_summary: snapshot.classificationTotals,
      profile: snapshot.profile,
      risk: snapshot.risk,
      created_at: snapshot.createdAt,
      updated_at: snapshot.updatedAt
    },
    "catalog.snapshot.persisted",
    {
      datasetId: snapshot.datasetId,
      sourceName: snapshot.trace.sourceName,
      riskLevel: snapshot.riskLevel
    }
  );
}

export function persistMappingInventory(inventory: MappingInventoryExport): Promise<SupabaseSyncResult> {
  return persistRow(
    env.SUPABASE_MAPPING_TABLE,
    {
      id: "current",
      exported_at: inventory.exportedAt,
      systems: inventory.systems,
      datasets: inventory.datasets,
      fields: inventory.fields,
      flows: inventory.flows,
      duplicate_groups: inventory.duplicateGroups,
      updated_at: new Date().toISOString()
    },
    "mapping.inventory.persisted",
    {
      systems: inventory.systems.length,
      datasets: inventory.datasets.length,
      fields: inventory.fields.length,
      flows: inventory.flows.length
    }
  );
}

export function persistRemediationTicket(ticket: RemediationTicket): Promise<SupabaseSyncResult> {
  return persistRow(
    env.SUPABASE_REMEDIATION_TABLE,
    {
      id: ticket.id,
      dataset_id: ticket.datasetId ?? null,
      source: ticket.source,
      risk_type: ticket.riskType,
      classification_category: ticket.classificationCategory,
      suggested_action: ticket.suggestedAction,
      assigned_user: ticket.assignedUser ?? null,
      resolution_notes: ticket.resolutionNotes ?? null,
      severity: ticket.severity,
      status: ticket.status,
      history: ticket.history,
      created_at: ticket.createdAt,
      updated_at: ticket.updatedAt
    },
    "remediation.ticket.persisted",
    {
      ticketId: ticket.id,
      datasetId: ticket.datasetId,
      status: ticket.status,
      severity: ticket.severity
    }
  );
}

export function persistReportRecord(record: ReportRecord): Promise<SupabaseSyncResult> {
  return persistRow(
    env.SUPABASE_REPORT_TABLE,
    {
      id: record.id,
      report_type: record.reportType,
      title: record.title,
      generated_at: record.generatedAt,
      primary_format: record.primaryFormat,
      summary: record.summary,
      tags: record.tags,
      generated_by: record.generatedBy ?? null,
      file_base_name: record.fileBaseName,
      content: record.content
    },
    "report.persisted",
    {
      reportId: record.id,
      reportType: record.reportType,
      primaryFormat: record.primaryFormat
    }
  );
}

export function persistAuditLog(entry: AuditLogEntry): Promise<SupabaseSyncResult> {
  return persistRow(
    env.SUPABASE_AUDIT_TABLE,
    {
      id: entry.id,
      timestamp: entry.timestamp,
      source: entry.source,
      action: entry.action,
      status: entry.status,
      duration_ms: entry.durationMs,
      metadata: entry.metadata ?? {}
    },
    "audit.log.persisted",
    {
      auditId: entry.id,
      action: entry.action,
      status: entry.status
    }
  );
}

export function persistAlertEvent(alert: AlertEvent): Promise<SupabaseSyncResult> {
  return persistRow(
    env.SUPABASE_ALERT_TABLE,
    {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      subject_key: alert.subjectKey,
      dataset_id: alert.datasetId ?? null,
      source: alert.source ?? null,
      metadata: alert.metadata,
      status: alert.status,
      channels: alert.channels,
      dedupe_key: alert.dedupeKey,
      delivered_at: alert.deliveredAt ?? null,
      created_at: alert.createdAt
    },
    "alert.persisted",
    {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      status: alert.status
    }
  );
}

export function persistNotification(notification: InAppNotification): Promise<SupabaseSyncResult> {
  return persistRow(
    env.SUPABASE_NOTIFICATION_TABLE,
    {
      id: notification.id,
      alert_id: notification.alertId,
      type: notification.type,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      read: notification.read,
      dataset_id: notification.datasetId ?? null,
      created_at: notification.createdAt
    },
    "notification.persisted",
    {
      notificationId: notification.id,
      alertId: notification.alertId,
      read: notification.read
    }
  );
}

export function persistEmailOutbox(entry: EmailOutboxEntry): Promise<SupabaseSyncResult> {
  return persistRow(
    env.SUPABASE_NOTIFICATION_TABLE,
    {
      id: entry.id,
      alert_id: entry.alertId,
      type: "email_outbox",
      severity: "low",
      title: entry.subject,
      message: entry.body,
      read: entry.sent,
      dataset_id: null,
      created_at: entry.createdAt,
      delivery: {
        to: entry.to,
        sent: entry.sent,
        error: entry.error ?? null
      }
    },
    "email.outbox.persisted",
    {
      emailOutboxId: entry.id,
      alertId: entry.alertId,
      sent: entry.sent
    }
  );
}

export function persistWorkflowRun(input: {
  id: string;
  status: "success" | "failure";
  durationMs: number;
  actorId?: string;
  datasetId?: string;
  reportId?: string;
  payload: Record<string, unknown>;
}): Promise<SupabaseSyncResult> {
  return persistRow(
    env.SUPABASE_WORKFLOW_TABLE,
    {
      id: input.id,
      status: input.status,
      duration_ms: input.durationMs,
      actor_id: input.actorId ?? null,
      dataset_id: input.datasetId ?? null,
      report_id: input.reportId ?? null,
      payload: input.payload,
      created_at: new Date().toISOString()
    },
    "workflow.run.persisted",
    {
      workflowRunId: input.id,
      status: input.status,
      datasetId: input.datasetId,
      reportId: input.reportId
    }
  );
}
