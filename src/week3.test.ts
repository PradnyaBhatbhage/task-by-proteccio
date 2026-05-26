import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { ClassificationScanResult } from "./classification/types";
import type { DiscoveryScanResult } from "./discovery";
import { env } from "./config/env";
import { roleHasPermission } from "./auth/permissions";
import { resolveRequiredPermission } from "./auth/route-policy";
import { analyzePrivacyRisk, enrichExposureHints } from "./risk";
import { RemediationStore } from "./remediation/store";
import { generateReport } from "./reporting/engine";
import { reportStore } from "./reporting/store";
import { alertDedupe } from "./alerting/dedupe";
import { enqueueAlert } from "./alerting/engine";
import { alertQueue } from "./alerting/queue";
import { alertStore } from "./alerting/store";

function aadhaarDiscovery(): DiscoveryScanResult {
  return {
    trace: {
      sourceType: "database",
      sourceName: "prod-pii-db",
      entityName: "customers"
    },
    scannedRecords: 1,
    findingsPerRecord: [
      {
        recordIndex: 0,
        findings: [
          {
            category: "aadhaar",
            methods: ["regex", "rule_validation"],
            path: "root.aadhaar_number",
            confidence: "high",
            maskedSample: "XXXX-XXXX-1234",
            valueLength: 12
          }
        ]
      }
    ],
    summary: { aadhaar: 1 }
  };
}

function aadhaarClassification(): ClassificationScanResult {
  return {
    trace: {
      sourceType: "database",
      sourceName: "prod-pii-db",
      entityName: "customers"
    },
    scannedRecords: 1,
    assignmentsPerRecord: [],
    summary: {
      "Personal Data": 1,
      "Sensitive Personal Data": 1
    }
  };
}

afterEach(() => {
  alertQueue.clear();
  alertStore.clear();
  alertDedupe.clear();
  reportStore.clear();
});

describe("Week 3 governance controls", () => {
  test("preserves compliance control attestations through risk hint enrichment", () => {
    const discovery = aadhaarDiscovery();
    const hints = enrichExposureHints(discovery, {
      encryptionIndicated: true,
      complianceControls: {
        retentionPolicyIndicated: true,
        privacyNoticeIndicated: true,
        lawfulBasisDocumented: true
      }
    });

    const analysis = analyzePrivacyRisk({
      discovery,
      classification: aadhaarClassification(),
      hints
    });

    assert.equal(analysis.exposureHintsApplied?.complianceControls?.retentionPolicyIndicated, true);
    assert.equal(
      analysis.complianceIntelligence.missingControls.some(
        (control) => control.id === "data_retention_policy" && control.regulation === "DPDP"
      ),
      false,
      "DPDP retention policy should not be reported missing when attested"
    );
    assert.equal(
      analysis.complianceIntelligence.flags.some((flag) => flag.id === "dpdp_aadhaar_retention"),
      false
    );
  });

  test("supports searchable remediation lifecycle and audit history", () => {
    const store = new RemediationStore();
    const created = store.create({
      source: "database:prod-pii-db/customers",
      riskType: "missing_encryption",
      classificationCategory: "Sensitive Personal Data",
      suggestedAction: "Enable encryption at rest and rotate access credentials.",
      severity: "critical",
      assignedUser: "privacy-admin@example.com"
    });

    const updated = store.update(
      created.id,
      {
        status: "resolved",
        resolutionNotes: "Encryption enabled and verified."
      },
      "privacy-admin@example.com"
    );

    assert.equal(updated?.status, "resolved");
    assert.equal(store.query({ status: "resolved", severity: "critical", q: "encryption" }).total, 1);
    assert.equal(store.query({ unresolved: true }).total, 0);
    assert.ok(store.history(created.id)?.some((entry) => entry.action === "resolved"));
  });

  test("enforces viewer read-only behavior through route policy permissions", () => {
    const writePermission = resolveRequiredPermission("POST", "/api/remediation/tickets");
    const readPermission = resolveRequiredPermission("GET", "/api/remediation/tickets");

    assert.equal(writePermission, "remediation:write");
    assert.equal(readPermission, "remediation:read");
    assert.equal(roleHasPermission("viewer", writePermission!), false);
    assert.equal(roleHasPermission("viewer", readPermission!), true);
    assert.equal(roleHasPermission("privacy_admin", writePermission!), true);
  });

  test("generates searchable audit-ready report history", async () => {
    const result = await generateReport({
      reportType: "executive_summary",
      format: "json",
      generatedBy: "test-suite",
      tags: ["week3"]
    });

    const history = reportStore.query({ reportType: "executive_summary", q: "week3" });
    assert.equal(result.record.primaryFormat, "json");
    assert.equal(result.download.contentType, "application/json");
    assert.equal(history.total, 1);
    assert.equal(history.items[0]?.hasContent, true);
  });

  test("delivers default alerts in-app without retrying failed email when email is not configured", async () => {
    env.ALERTS_ENABLED = true;
    env.ALERT_EMAIL_TO = undefined;
    env.ALERT_WEBHOOK_URL = undefined;
    env.ALERT_IN_APP_ENABLED = true;

    const id = enqueueAlert({
      type: "compliance_violation",
      severity: "critical",
      title: "Critical compliance violation",
      message: "A high-risk compliance flag was detected.",
      subjectKey: "dataset-1:dpdp",
      datasetId: "dataset-1"
    });

    assert.ok(id);
    assert.deepEqual(alertStore.get(id!)?.channels, ["in_app"]);

    const delivered = await alertQueue.drain();
    assert.equal(delivered, 1);
    assert.equal(alertStore.get(id!)?.status, "delivered");
    assert.equal(alertStore.listEmailOutbox().length, 0);
    assert.equal(alertStore.listNotifications({}).total, 1);
  });
});
