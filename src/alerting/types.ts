import type { RiskLevel } from "../risk/types";

export type AlertType =
  | "critical_sensitive_discovery"
  | "compliance_violation"
  | "failed_scan"
  | "high_risk_dataset"
  | "remediation_overdue";

export type AlertSeverity = RiskLevel;

export type AlertStatus = "pending" | "queued" | "delivered" | "suppressed" | "failed";

export type NotificationChannel = "email" | "in_app";

export interface AlertEvent {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** Stable key for deduplication (dataset, job, ticket, or scan composite). */
  subjectKey: string;
  datasetId?: string;
  source?: string;
  metadata: Record<string, string | number | boolean | null>;
  status: AlertStatus;
  channels: NotificationChannel[];
  createdAt: string;
  deliveredAt?: string;
  dedupeKey: string;
}

export interface InAppNotification {
  id: string;
  alertId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  datasetId?: string;
}

export interface EnqueueAlertInput {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  subjectKey: string;
  datasetId?: string;
  source?: string;
  metadata?: Record<string, string | number | boolean | null>;
  channels?: NotificationChannel[];
}

export interface AlertQuery {
  type?: AlertType;
  severity?: AlertSeverity;
  status?: AlertStatus;
  datasetId?: string;
  page?: number;
  pageSize?: number;
}

export interface NotificationQuery {
  unreadOnly?: boolean;
  type?: AlertType;
  page?: number;
  pageSize?: number;
}

export interface AlertQueueJob {
  id: string;
  alertId: string;
  channels: NotificationChannel[];
  enqueuedAt: string;
  attempts: number;
}

export interface EmailOutboxEntry {
  id: string;
  alertId: string;
  to: string[];
  subject: string;
  body: string;
  createdAt: string;
  sent: boolean;
  error?: string;
}
