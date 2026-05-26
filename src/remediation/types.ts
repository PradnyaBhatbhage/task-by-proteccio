import type { ClassificationLabel } from "../classification/types";
import type { RiskLevel } from "../risk/types";

export type RemediationSeverity = RiskLevel;

export type RemediationStatus = "open" | "in_progress" | "resolved" | "closed";

export type RemediationHistoryAction =
  | "created"
  | "updated"
  | "status_changed"
  | "assigned"
  | "resolved"
  | "closed";

export interface RemediationHistoryEntry {
  id: string;
  timestamp: string;
  action: RemediationHistoryAction;
  /** Optional actor identifier (e.g. assigned user performing the change). */
  actor?: string;
  /** Safe metadata only — no sensitive payloads. */
  details: Record<string, string | number | boolean | null>;
}

export interface RemediationTicket {
  id: string;
  /** Logical source identifier (system name, dataset id, or composite source label). */
  source: string;
  /** Risk category or factor type (e.g. public_exposure, compliance_gap). */
  riskType: string;
  classificationCategory: ClassificationLabel | string;
  suggestedAction: string;
  assignedUser?: string;
  resolutionNotes?: string;
  severity: RemediationSeverity;
  status: RemediationStatus;
  createdAt: string;
  updatedAt: string;
  /** Optional link to a governance catalog dataset. */
  datasetId?: string;
  history: RemediationHistoryEntry[];
}

export interface CreateRemediationInput {
  source: string;
  riskType: string;
  classificationCategory: ClassificationLabel | string;
  suggestedAction: string;
  severity: RemediationSeverity;
  assignedUser?: string;
  resolutionNotes?: string;
  datasetId?: string;
  /** Initial status; defaults to open. */
  status?: RemediationStatus;
}

export interface UpdateRemediationInput {
  source?: string;
  riskType?: string;
  classificationCategory?: ClassificationLabel | string;
  suggestedAction?: string;
  severity?: RemediationSeverity;
  status?: RemediationStatus;
  assignedUser?: string | null;
  resolutionNotes?: string | null;
}

export interface RemediationQuery {
  status?: RemediationStatus;
  severity?: RemediationSeverity;
  /** When true, returns open and in_progress tickets only. */
  unresolved?: boolean;
  /** Case-insensitive search across source, riskType, suggestedAction, assignedUser. */
  q?: string;
  datasetId?: string;
  page?: number;
  pageSize?: number;
}
