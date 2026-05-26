import type { DiscoveryScanResult } from "../discovery";
import { comboCriticalFromDiscovery } from "../risk/factors";
import type { ComplianceIntelligenceReport } from "../risk/compliance/types";
import type { PrivacyRiskAnalysis } from "../risk/types";
import { stableDatasetId, stableSystemId } from "../mapping";
import type { RemediationTicket } from "../remediation/types";
import type { SensitiveCategory } from "../discovery";
import { enqueueAlert } from "./engine";
import type { AlertSeverity } from "./types";

const CRITICAL_CATEGORIES: SensitiveCategory[] = [
  "aadhaar",
  "payment_card",
  "authentication_field",
  "pan",
  "passport"
];

function datasetKeyFromDiscovery(discovery: DiscoveryScanResult): string {
  const systemId = stableSystemId(discovery.trace.sourceType, discovery.trace.sourceName);
  return stableDatasetId(systemId, discovery.trace.entityName);
}

function sourceLabel(discovery: DiscoveryScanResult): string {
  return `${discovery.trace.sourceType}:${discovery.trace.sourceName}/${discovery.trace.entityName}`;
}

function criticalCategoryHits(discovery: DiscoveryScanResult): SensitiveCategory[] {
  const hits: SensitiveCategory[] = [];
  for (const cat of CRITICAL_CATEGORIES) {
    if ((discovery.summary[cat] ?? 0) > 0) hits.push(cat);
  }
  return hits;
}

/**
 * Fire alerts when discovery finds critical sensitive data combinations or categories.
 */
export function evaluateCriticalSensitiveDiscovery(discovery: DiscoveryScanResult): void {
  const combo = comboCriticalFromDiscovery(discovery);
  const criticalHits = criticalCategoryHits(discovery);
  const highVolumeCritical = criticalHits.some((c) => (discovery.summary[c] ?? 0) >= 5);

  if (!combo && criticalHits.length === 0) return;

  const datasetId = datasetKeyFromDiscovery(discovery);
  const subjectKey = combo ? `${datasetId}:combo` : `${datasetId}:${criticalHits.join("+")}`;

  const severity: AlertSeverity = combo ? "critical" : highVolumeCritical ? "high" : "high";
  const categories = criticalHits.length ? criticalHits.join(", ") : "critical combination";

  enqueueAlert({
    type: "critical_sensitive_discovery",
    severity,
    title: "Critical sensitive data discovered",
    message: combo
      ? `Critical attribute combination detected in ${sourceLabel(discovery)}. Immediate review required.`
      : `High-sensitivity categories detected (${categories}) in ${sourceLabel(discovery)}.`,
    subjectKey,
    datasetId,
    source: sourceLabel(discovery),
    metadata: {
      comboCritical: combo,
      categories: categories,
      scannedRecords: discovery.scannedRecords
    }
  });
}

/**
 * Compliance violation alerts from risk/compliance intelligence.
 */
export function evaluateComplianceViolation(
  discovery: DiscoveryScanResult,
  compliance: ComplianceIntelligenceReport | undefined,
  datasetId?: string
): void {
  if (!compliance) return;

  const status = compliance.status;
  const criticalFlags = compliance.flags.filter((f) => f.severity === "critical" || f.severity === "high");
  const violated = compliance.violatedControls.length + compliance.missingControls.length;

  const isViolation =
    status === "non_compliant" || criticalFlags.length > 0 || (status === "partial" && violated >= 3);

  if (!isViolation) return;

  const id = datasetId ?? datasetKeyFromDiscovery(discovery);
  const flagIds = criticalFlags.map((f) => f.id).join(",") || "status";
  const subjectKey = `${id}:compliance:${status}:${flagIds.slice(0, 64)}`;

  enqueueAlert({
    type: "compliance_violation",
    severity: criticalFlags.some((f) => f.severity === "critical") ? "critical" : "high",
    title: "Compliance violation detected",
    message: `Dataset ${discovery.trace.entityName} has compliance status "${status}" with ${criticalFlags.length} high/critical flag(s) and ${violated} control gap(s).`,
    subjectKey,
    datasetId: id,
    source: sourceLabel(discovery),
    metadata: {
      status,
      flagCount: criticalFlags.length,
      violatedControls: compliance.violatedControls.length,
      missingControls: compliance.missingControls.length,
      regulations: compliance.applicableRegulations.join(", ")
    }
  });
}

/**
 * High-risk dataset alert after profiling/risk analysis.
 */
export function evaluateHighRiskDataset(
  discovery: DiscoveryScanResult,
  analysis: PrivacyRiskAnalysis
): void {
  if (!analysis.isHighRiskDataset && analysis.level !== "high" && analysis.level !== "critical") return;

  const datasetId = analysis.datasetId;
  const subjectKey = `${datasetId}:risk:${analysis.level}`;

  enqueueAlert({
    type: "high_risk_dataset",
    severity: analysis.level === "critical" ? "critical" : "high",
    title: "High-risk dataset identified",
    message: `Dataset ${discovery.trace.entityName} scored ${analysis.score}/100 (${analysis.level}). Reasons: ${analysis.highRiskReasons.slice(0, 3).join("; ")}.`,
    subjectKey,
    datasetId,
    source: sourceLabel(discovery),
    metadata: {
      score: analysis.score,
      level: analysis.level,
      reasonCount: analysis.highRiskReasons.length
    }
  });
}

/**
 * Failed scan / ingestion job alert.
 */
export function evaluateFailedScan(input: {
  subjectKey: string;
  source: string;
  errorMessage: string;
  scanKind?: string;
}): void {
  enqueueAlert({
    type: "failed_scan",
    severity: "high",
    title: "Scan or ingestion failed",
    message: `${input.source} failed: ${input.errorMessage}`,
    subjectKey: input.subjectKey,
    source: input.source,
    metadata: {
      scanKind: input.scanKind ?? "unknown",
      error: input.errorMessage.slice(0, 500)
    }
  });
}

/**
 * Remediation ticket overdue alert.
 */
export function evaluateRemediationOverdue(ticket: RemediationTicket, overdueDays: number): void {
  const subjectKey = `ticket:${ticket.id}:overdue`;

  enqueueAlert({
    type: "remediation_overdue",
    severity: ticket.severity === "critical" ? "critical" : "high",
    title: "Remediation overdue",
    message: `Ticket for ${ticket.source} (${ticket.riskType}) has been ${ticket.status} for more than ${overdueDays} days.`,
    subjectKey,
    datasetId: ticket.datasetId,
    source: ticket.source,
    metadata: {
      ticketId: ticket.id,
      status: ticket.status,
      overdueDays,
      severity: ticket.severity
    }
  });
}

/** Combined post-scan evaluation (discovery + optional risk). */
export function evaluatePostScanAlerts(
  discovery: DiscoveryScanResult,
  analysis?: PrivacyRiskAnalysis
): void {
  evaluateCriticalSensitiveDiscovery(discovery);
  if (analysis) {
    evaluateComplianceViolation(discovery, analysis.complianceIntelligence, analysis.datasetId);
    evaluateHighRiskDataset(discovery, analysis);
  }
}
