"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { fmtNum, fmtPct01, titleize } from "@/lib/format";

type Analytics = {
  profilingStatistics?: Record<string, any>;
  complianceViolations?: Record<string, any>;
  remediationStatus?: Record<string, any>;
  mostExposedSystems?: Array<Record<string, any>>;
};

export default function GovernancePage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      setData(await apiFetch<Analytics>("/api/dashboard/analytics"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Governance load failed");
    }
  }

  async function createTickets() {
    try {
      const result = await apiFetch<{ created?: unknown[] }>("/api/remediation/from-prioritization", {
        method: "POST",
        body: JSON.stringify({ minLevel: "medium", limit: 25, skipExistingForDataset: true })
      });
      setMessage(`Created ${result.created?.length || 0} remediation ticket(s).`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Remediation failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const p = data?.profilingStatistics || {};
  const c = data?.complianceViolations || {};
  const r = data?.remediationStatus || {};

  return (
    <AppShell>
      <div className="mb-8 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Badge>Governance & Profiling</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Compliance, profiling, and remediation control plane</h1>
          <p className="mt-3 max-w-2xl text-slate-400">Review dataset quality, exposed systems, regulatory exposure, and remediation workflow health.</p>
        </div>
        <Button onClick={() => void createTickets()}>Create tickets from risk queue</Button>
      </div>
      {message ? <Card className="mb-6 text-blue-100">{message}</Card> : null}

      <section className="grid gap-4 md:grid-cols-5">
        <Metric label="Datasets profiled" value={p.datasetsProfiled} />
        <Metric label="Avg completeness" value={fmtPct01(p.averageDataCompleteness)} />
        <Metric label="Anomalies" value={p.totalAnomalies} />
        <Metric label="Sensitive findings" value={p.totalSensitiveFindings} />
        <Metric label="Avg findings / record" value={p.averageFindingsPerSensitiveRecord ?? "-"} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Compliance Indicators</CardTitle><CardDescription>GDPR, DPDP, HIPAA, CCPA, and ISO 27001 signals.</CardDescription></CardHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Datasets with violations" value={c.datasetsWithViolations} />
            <Metric label="Compliance flags" value={c.totalComplianceFlags} />
            <Metric label="Violated controls" value={c.totalViolatedControls} />
            <Metric label="Missing controls" value={c.totalMissingControls} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(c.byRegulation || {}).map(([reg, count]) => <Badge key={reg}>{reg}: {fmtNum(count)}</Badge>)}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Remediation Workflow</CardTitle><CardDescription>Open, active, completed, and severity distribution.</CardDescription></CardHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Open" value={r.openVsResolved?.open} />
            <Metric label="In progress" value={r.openVsResolved?.inProgress} />
            <Metric label="Resolved" value={r.openVsResolved?.resolved} />
            <Metric label="Total tickets" value={r.totalTickets} />
          </div>
        </Card>
      </section>

      <Card className="mt-6">
        <CardHeader><CardTitle>Most Exposed Systems</CardTitle><CardDescription>Ranked by sensitive records, exposure flows, and risk score.</CardDescription></CardHeader>
        <div className="space-y-3">
          {(data?.mostExposedSystems || []).length ? data!.mostExposedSystems!.slice(0, 8).map((system) => (
            <div key={String(system.systemId)} className="flex items-center justify-between rounded-2xl bg-slate-950/45 p-3">
              <div><p className="font-medium text-white">{system.sourceName || system.systemId}</p><p className="text-xs text-slate-500">{(system.reasons || []).join(", ") || "Exposure signals"}</p></div>
              <Badge>{titleize(system.maxRiskLevel)} · {fmtNum(system.exposureScore)}</Badge>
            </div>
          )) : <p className="text-sm text-slate-500">No exposed systems identified yet.</p>}
        </div>
      </Card>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-2xl bg-slate-950/45 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{typeof value === "string" ? value : fmtNum(value)}</p></div>;
}
