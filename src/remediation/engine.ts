import type { GovernanceDatasetSnapshot } from "../catalog/types";
import type { RiskPrioritizationItem } from "../risk/types";
import { remediationStore } from "./store";
import type { CreateRemediationInput, RemediationTicket } from "./types";

function primaryClassificationLabel(snap: GovernanceDatasetSnapshot): string {
  const totals = snap.classificationTotals;
  let best: string = "Personal Data";
  let max = 0;
  for (const [label, count] of Object.entries(totals)) {
    const n = count ?? 0;
    if (n > max) {
      max = n;
      best = label;
    }
  }
  if (max === 0) {
    const discovery = snap.discoveryCategoryTotals;
    const top = Object.entries(discovery).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    return top ? `discovery:${top[0]}` : "Unclassified";
  }
  return best;
}

function primaryRiskType(snap: GovernanceDatasetSnapshot): string {
  const analysisFactors = snap.risk.analysis?.factors;
  if (analysisFactors?.length) {
    const top = [...analysisFactors].sort((a, b) => b.rawScore - a.rawScore)[0];
    return top.id;
  }
  return snap.risk.factors[0] ?? "privacy_risk";
}

function suggestedActionFromHints(hints: string[]): string {
  if (hints.length === 0) return "Review dataset risk assessment and apply appropriate controls.";
  return hints.map((h) => h.replace(/_/g, " ")).join("; ");
}

/**
 * Build remediation ticket payloads from a risk prioritization queue item.
 */
export function remediationInputFromPrioritization(
  item: RiskPrioritizationItem,
  snap?: GovernanceDatasetSnapshot
): CreateRemediationInput {
  const source = `${item.sourceType}:${item.sourceName}/${item.entityName}`;
  const classificationCategory = snap ? primaryClassificationLabel(snap) : "Personal Data";
  const riskType = snap ? primaryRiskType(snap) : "privacy_risk";
  const suggestedAction = suggestedActionFromHints(item.actionHints);

  return {
    source,
    riskType,
    classificationCategory,
    suggestedAction,
    severity: item.riskLevel,
    datasetId: item.datasetId,
    status: "open"
  };
}

/**
 * Create remediation tickets from catalog prioritization items (skips duplicates by datasetId when open).
 */
export function createTicketsFromPrioritization(
  items: RiskPrioritizationItem[],
  snapshotsByDataset: Map<string, GovernanceDatasetSnapshot>,
  options?: { limit?: number; skipExistingForDataset?: boolean }
): { created: RemediationTicket[]; skipped: number } {
  const limit = options?.limit ?? items.length;
  const skipExisting = options?.skipExistingForDataset ?? true;
  const openDatasetIds = new Set(
    remediationStore
      .list()
      .filter((t) => t.status === "open" || t.status === "in_progress")
      .map((t) => t.datasetId)
      .filter((id): id is string => Boolean(id))
  );

  const created: RemediationTicket[] = [];
  let skipped = 0;

  for (const item of items.slice(0, limit)) {
    if (skipExisting && openDatasetIds.has(item.datasetId)) {
      skipped += 1;
      continue;
    }
    const snap = snapshotsByDataset.get(item.datasetId);
    const input = remediationInputFromPrioritization(item, snap);
    const ticket = remediationStore.create(input);
    created.push(ticket);
    if (ticket.datasetId) openDatasetIds.add(ticket.datasetId);
  }

  return { created, skipped };
}
