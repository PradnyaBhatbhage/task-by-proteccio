import type {
  ClassificationAssignment,
  ClassificationEvidence,
  ClassificationOptions,
  ClassificationRecordResult,
  ClassificationScanResult,
  ClassificationReasoning
} from "./types";
import type {
  Confidence as DiscoveryConfidence,
  DetectionMethod,
  DiscoveryScanResult,
  SensitiveCategory
} from "../discovery";
import { CATEGORY_TO_LABEL_RULES } from "./rules";
import type { ClassificationLabel } from "./types";

/** Field names suggesting health records; attaches Health Data only with conservative matching. */
const HEALTH_FIELD_RE =
  /\b(?:patient|clinical|medical|diagnos|hospital|physician|prescription|mrn|npi|icd|snomed|blood_?type|allerg)\b/i;

const PHI_ADJACENT_CATEGORIES = new Set<SensitiveCategory>([
  "person_name",
  "address",
  "date_of_birth",
  "phone",
  "email"
]);

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function discoveryConfidenceToScore(confidence: DiscoveryConfidence): number {
  // Calibrated heuristic: output should remain stable and deterministic.
  if (confidence === "high") return 0.97;
  if (confidence === "medium") return 0.8;
  return 0.6;
}

function hasMethod(methods: DetectionMethod[], m: DetectionMethod): boolean {
  return methods.includes(m);
}

function scoreMethodAdjustment(methods: DetectionMethod[]): number {
  // Small deterministic adjustments to reflect detector strength.
  let delta = 0;
  if (hasMethod(methods, "rule_validation")) delta += 0.03;
  if (hasMethod(methods, "keyword")) delta -= 0.02;
  if (hasMethod(methods, "pattern")) delta += 0.01;
  return delta;
}

function fieldFromDiscoveryPath(path: string): string {
  const p = (path ?? "").trim();
  if (!p || p === "(root)") return "root";

  // flattenRecord produces JSON paths like: a.b[0].c
  const lastDot = p.lastIndexOf(".");
  const last = lastDot >= 0 ? p.slice(lastDot + 1) : p;

  if (last.startsWith("[")) return "value";
  return last.replace(/\[\d+\]$/g, "");
}

function uniqueEvidenceKey(e: ClassificationEvidence): string {
  return `${e.discoveryCategory}::${e.discoveryConfidence}::${e.discoveryPath}`;
}

function mergeReasoning(
  base: ClassificationReasoning,
  incomingEvidence: ClassificationEvidence[]
): ClassificationReasoning {
  const existingKeys = new Set(base.evidence.map(uniqueEvidenceKey));
  const merged = [...base.evidence];
  for (const e of incomingEvidence) {
    const k = uniqueEvidenceKey(e);
    if (existingKeys.has(k)) continue;
    merged.push(e);
    existingKeys.add(k);
  }
  return { ...base, evidence: merged };
}

function buildReasoning(
  why: string,
  evidence: ClassificationEvidence[],
  ruleId: ClassificationReasoning["ruleId"] = "discovery_category_mapping"
): ClassificationReasoning {
  return {
    ruleId,
    why: `${why}`,
    evidence
  };
}

function computeAssignmentConfidence(
  discoveryConfidence: DiscoveryConfidence,
  methods: DetectionMethod[],
  confidenceMultiplier: number
): number {
  const base = discoveryConfidenceToScore(discoveryConfidence);
  const adjusted = base * confidenceMultiplier + scoreMethodAdjustment(methods);
  return clamp01(adjusted);
}

export function classifyDiscoveryScan(
  discovery: DiscoveryScanResult,
  options?: ClassificationOptions
): ClassificationScanResult {
  const maxEvidencePerAssignment = options?.maxEvidencePerAssignment ?? 10;
  const includeReasoning = options?.includeReasoning ?? true;

  const summary: Partial<Record<ClassificationLabel, number>> = {};
  const assignmentsPerRecord: ClassificationRecordResult[] = [];

  for (const recordResult of discovery.findingsPerRecord) {
    // field+label aggregation per record.
    const map = new Map<string, ClassificationAssignment>();

    for (const finding of recordResult.findings) {
      const field = fieldFromDiscoveryPath(finding.path);

      const evidence: ClassificationEvidence = {
        discoveryCategory: finding.category,
        discoveryMethods: finding.methods,
        discoveryConfidence: finding.confidence,
        discoveryPath: finding.path,
        maskedSamplePresent: finding.maskedSample !== undefined
      };

      const rules = CATEGORY_TO_LABEL_RULES[finding.category];
      if (rules && rules.length > 0) {
        for (const rule of rules) {
          const key = `${field}::${rule.label}`;
          const confidence = computeAssignmentConfidence(finding.confidence, finding.methods, rule.confidenceMultiplier);

          const existing = map.get(key);
          if (!existing) {
            const reasoning = includeReasoning ? buildReasoning(rule.why, [evidence]) : buildReasoning(rule.why, []);
            const assignment: ClassificationAssignment = { field, label: rule.label, confidence, reasoning };
            map.set(key, assignment);
          } else {
            if (confidence > existing.confidence) {
              existing.confidence = confidence;
            }
            if (includeReasoning) {
              existing.reasoning = mergeReasoning(existing.reasoning, [evidence]);
              if (existing.reasoning.evidence.length > maxEvidencePerAssignment) {
                existing.reasoning.evidence = existing.reasoning.evidence.slice(
                  0,
                  maxEvidencePerAssignment
                );
              }
            }
          }
        }
      }

      if (HEALTH_FIELD_RE.test(field) && PHI_ADJACENT_CATEGORIES.has(finding.category)) {
        const label: ClassificationLabel = "Health Data";
        const hKey = `${field}::${label}`;
        const confidence = computeAssignmentConfidence(finding.confidence, finding.methods, 0.82);
        const hExisting = map.get(hKey);
        if (!hExisting) {
          const reasoning = includeReasoning
            ? buildReasoning(
                "Field naming suggests a clinical or health record context for this personal attribute.",
                [evidence],
                "health_field_context"
              )
            : buildReasoning("", [], "health_field_context");
          map.set(hKey, { field, label, confidence, reasoning });
        } else {
          if (confidence > hExisting.confidence) hExisting.confidence = confidence;
          if (includeReasoning) {
            hExisting.reasoning = mergeReasoning(hExisting.reasoning, [evidence]);
            if (hExisting.reasoning.evidence.length > maxEvidencePerAssignment) {
              hExisting.reasoning.evidence = hExisting.reasoning.evidence.slice(0, maxEvidencePerAssignment);
            }
          }
        }
      }
    }

    const recordAssignments = [...map.values()];
    recordAssignments.sort((a, b) => {
      if (a.field !== b.field) return a.field.localeCompare(b.field);
      return a.label.localeCompare(b.label);
    });

    for (const a of recordAssignments) {
      summary[a.label] = (summary[a.label] ?? 0) + 1;
    }

    assignmentsPerRecord.push({
      recordIndex: recordResult.recordIndex,
      assignments: recordAssignments
    });
  }

  return {
    trace: discovery.trace,
    scannedRecords: discovery.scannedRecords,
    assignmentsPerRecord,
    summary
  };
}

