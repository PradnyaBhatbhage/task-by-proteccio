"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { fmtNum, titleize } from "@/lib/format";

type ComplianceAnalytics = {
  complianceViolations?: {
    datasetsWithViolations?: number;
    datasetsNonCompliant?: number;
    datasetsPartiallyCompliant?: number;
    totalComplianceFlags?: number;
    totalViolatedControls?: number;
    totalMissingControls?: number;
    totalAtRiskControls?: number;
    byStatus?: Record<string, number>;
    byRegulation?: Record<string, number>;
  };
  sourceWiseBreakdown?: Record<string, {
    sourceType: string;
    sourceName: string;
    datasets: number;
    scannedRecords: number;
    sensitiveRecords: number;
    maxRisk: string;
  }>;
  highRiskDatasets?: {
    topDatasets?: Array<Record<string, unknown>>;
  };
};

export default function CompliancePage() {
  const [data, setData] = useState<ComplianceAnalytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setData(await apiFetch<ComplianceAnalytics>("/api/dashboard/analytics"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Compliance dashboard load failed");
      }
    }
    void load();
  }, []);

  const compliance = data?.complianceViolations || {};
  const byRegulation = Object.entries(compliance.byRegulation || {}).sort((a, b) => b[1] - a[1]);
  const byStatus = Object.entries(compliance.byStatus || {}).sort((a, b) => b[1] - a[1]);
  const sources = Object.values(data?.sourceWiseBreakdown || {}).sort((a, b) => b.sensitiveRecords - a.sensitiveRecords);
  const highRisk = data?.highRiskDatasets?.topDatasets || [];

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>Compliance Overview Dashboard</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Regulatory exposure and compliance posture</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Dedicated overview for GDPR, DPDP, HIPAA, CCPA, and ISO 27001 indicators, violated controls, missing controls, and source-level exposure.
        </p>
      </div>

      {error ? <Card className="mb-6 border-red-400/30 bg-red-500/10 text-red-100">{error}</Card> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Datasets with violations" value={compliance.datasetsWithViolations} />
        <Metric label="Non-compliant datasets" value={compliance.datasetsNonCompliant} />
        <Metric label="Partially compliant" value={compliance.datasetsPartiallyCompliant} />
        <Metric label="Compliance flags" value={compliance.totalComplianceFlags} />
        <Metric label="Violated controls" value={compliance.totalViolatedControls} />
        <Metric label="Missing controls" value={compliance.totalMissingControls} />
        <Metric label="At-risk controls" value={compliance.totalAtRiskControls} />
        <Metric label="Regulations flagged" value={byRegulation.length} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <DistributionCard title="Exposure By Regulation" description="Flag and control counts grouped by regulation." rows={byRegulation} />
        <DistributionCard title="Compliance Status" description="Dataset posture grouped by compliance status." rows={byStatus.map(([status, count]) => [titleize(status), count])} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source Compliance Exposure</CardTitle>
            <CardDescription>Sources with the largest sensitive record footprint and maximum risk.</CardDescription>
          </CardHeader>
          <div className="space-y-3">
            {sources.length ? sources.slice(0, 8).map((source) => (
              <div key={`${source.sourceType}:${source.sourceName}`} className="grid grid-cols-4 gap-3 rounded-2xl bg-slate-950/45 p-3 text-sm">
                <div className="col-span-2">
                  <p className="font-medium text-white">{source.sourceName}</p>
                  <p className="text-xs text-slate-500">{source.sourceType} · {fmtNum(source.datasets)} datasets</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Sensitive</p>
                  <p className="font-semibold text-white">{fmtNum(source.sensitiveRecords)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Max risk</p>
                  <p className="font-semibold text-white">{titleize(source.maxRisk)}</p>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">No source compliance exposure yet. Run discovery first.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>High-Risk Compliance Watchlist</CardTitle>
            <CardDescription>Datasets that should be reviewed first by privacy and compliance teams.</CardDescription>
          </CardHeader>
          <div className="space-y-3">
            {highRisk.length ? highRisk.slice(0, 8).map((item, index) => (
              <div key={index} className="flex items-center justify-between rounded-2xl bg-slate-950/45 p-3">
                <div>
                  <p className="font-medium text-white">{String(item.datasetId || item.entityName || "dataset")}</p>
                  <p className="text-xs text-slate-500">{String(item.sourceName || item.reason || "Compliance review")}</p>
                </div>
                <Badge>{titleize(item.riskLevel || item.level)} · {fmtNum(item.riskScore || item.score)}</Badge>
              </div>
            )) : <p className="text-sm text-slate-500">No high-risk compliance items yet.</p>}
          </div>
        </Card>
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{fmtNum(value)}</p>
    </Card>
  );
}

function DistributionCard({ title, description, rows }: { title: string; description: string; rows: Array<[string, number]> }) {
  const max = Math.max(...rows.map(([, count]) => count), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <div className="space-y-3">
        {rows.length ? rows.map(([label, count]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-sm text-slate-300">
              <span>{label}</span>
              <span>{fmtNum(count)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800">
              <div className="h-2 rounded-full bg-blue-400" style={{ width: `${Math.max(6, (count / max) * 100)}%` }} />
            </div>
          </div>
        )) : <p className="text-sm text-slate-500">No compliance data yet.</p>}
      </div>
    </Card>
  );
}
