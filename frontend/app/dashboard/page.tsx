"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Database, FileText, GitBranch, Radar, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL, apiFetch, getSession } from "@/lib/api";
import { fmtNum, titleize } from "@/lib/format";

type DashboardAnalytics = {
  generatedAt?: string;
  totalScannedSources?: number;
  totalScannedRecords?: number;
  totalSensitiveRecords?: number;
  highRiskSourceCount?: number;
  catalogAndInventoryCounts?: Record<string, number>;
  riskDistribution?: Record<string, number>;
  classificationDistribution?: { catalogLabelTotals?: Record<string, number>; mappedFieldLabelTotals?: Record<string, number> };
  discoveryStatistics?: { catalogCategoryTotals?: Record<string, number>; mappedFieldRowsByCategory?: Record<string, number> };
  sourceWiseBreakdown?: Record<string, { sourceType: string; sourceName: string; datasets: number; scannedRecords: number; sensitiveRecords: number; maxRisk: string }>;
  highRiskDatasets?: { count?: number; topDatasets?: Array<Record<string, unknown>> };
  complianceViolations?: Record<string, unknown>;
  remediationStatus?: { totalTickets?: number; openVsResolved?: Record<string, number> };
};

const statCards = [
  { key: "totalScannedRecords", label: "Scanned records", icon: Activity },
  { key: "totalSensitiveRecords", label: "Sensitive records", icon: ShieldCheck },
  { key: "highRiskSourceCount", label: "High-risk sources", icon: AlertTriangle },
  { key: "datasetsInCatalog", label: "Catalog datasets", icon: Database },
  { key: "mappedFields", label: "Mapped fields", icon: GitBranch },
  { key: "dataFlows", label: "Data flows", icon: Radar },
  { key: "duplicateSensitiveGroups", label: "Duplicate groups", icon: FileText },
  { key: "totalTickets", label: "Remediation tickets", icon: FileText }
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [platform, setPlatform] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const liveAbort = useRef<AbortController | null>(null);

  async function load() {
    setError("");
    try {
      const [analytics, status] = await Promise.all([
        apiFetch<DashboardAnalytics>("/api/dashboard/analytics"),
        apiFetch<Record<string, any>>("/api/platform/status")
      ]);
      setData(analytics);
      setPlatform(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dashboard load failed");
    }
  }

  async function toggleLive() {
    if (liveAbort.current) {
      liveAbort.current.abort();
      liveAbort.current = null;
      setLive(false);
      return;
    }
    const session = getSession();
    const controller = new AbortController();
    liveAbort.current = controller;
    setLive(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/realtime/dashboard`, {
        headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
        signal: controller.signal
      });
      if (!res.ok || !res.body) throw new Error(`Live stream failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          const line = evt.split("\n").find((x) => x.startsWith("data: "));
          if (line) setData(JSON.parse(line.slice(6)));
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Live stream failed");
      }
    } finally {
      liveAbort.current = null;
      setLive(false);
    }
  }

  useEffect(() => {
    void load();
    return () => liveAbort.current?.abort();
  }, []);

  function statValue(key: string) {
    if (key === "totalTickets") return data?.remediationStatus?.totalTickets ?? 0;
    return (data as Record<string, unknown> | null)?.[key] ?? data?.catalogAndInventoryCounts?.[key] ?? 0;
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Badge>Executive Dashboard</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Privacy intelligence command center</h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            Real-time-ready KPIs for discovery, classification, risk, compliance exposure, remediation, and reporting.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={load}>Refresh</Button>
          <Button variant={live ? "primary" : "secondary"} onClick={() => void toggleLive()}>{live ? "Stop live" : "Start live"}</Button>
          <Link href="/discovery"><Button>Run workflow</Button></Link>
        </div>
      </div>

      {error ? <Card className="mb-6 border-red-400/30 bg-red-500/10 text-red-100">{error}</Card> : null}
      <section className="mb-6 grid gap-4 xl:grid-cols-3">
        <StatusCard title="Supabase" ok={Boolean(platform?.supabase?.configured)} text={platform?.supabase?.message || "Checking platform status"} />
        <StatusCard title="Auth" ok={Boolean(platform?.app?.rbacEnabled)} text={platform?.app?.auth || "RBAC status"} />
        <StatusCard title="Realtime" ok text={live ? "Live dashboard stream connected" : "SSE endpoint ready"} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          const value = statValue(item.key);
          return (
            <Card key={item.key} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">{item.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{fmtNum(value)}</p>
                </div>
                <div className="rounded-2xl bg-blue-500/15 p-3 text-blue-200">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Risk Distribution</CardTitle>
            <CardDescription>Catalog datasets by assessed privacy risk level.</CardDescription>
          </CardHeader>
          <div className="space-y-3">
            {Object.entries(data?.riskDistribution ?? { low: 0, medium: 0, high: 0, critical: 0 }).map(([level, count]) => (
              <div key={level}>
                <div className="mb-1 flex justify-between text-sm text-slate-300">
                  <span className="capitalize">{level}</span>
                  <span>{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${Math.min(100, Number(count) * 12)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compliance Snapshot</CardTitle>
            <CardDescription>GDPR, DPDP, HIPAA, CCPA, and ISO 27001 indicators from the backend analytics layer.</CardDescription>
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-950/45 p-4">
              <p className="text-sm text-slate-400">Datasets with violations</p>
              <p className="mt-2 text-3xl font-semibold text-white">{fmtNum(data?.complianceViolations?.datasetsWithViolations)}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/45 p-4">
              <p className="text-sm text-slate-400">Compliance flags</p>
              <p className="mt-2 text-3xl font-semibold text-white">{fmtNum(data?.complianceViolations?.totalComplianceFlags)}</p>
            </div>
          </div>
        </Card>
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <DistributionCard title="Classification (catalog)" values={data?.classificationDistribution?.catalogLabelTotals} />
        <DistributionCard title="Discovery categories" values={data?.discoveryStatistics?.catalogCategoryTotals} />
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <ListCard title="High-risk datasets" items={data?.highRiskDatasets?.topDatasets || []} />
        <SourceBreakdown sources={Object.values(data?.sourceWiseBreakdown || {})} />
      </section>
    </AppShell>
  );
}

function StatusCard({ title, ok, text }: { title: string; ok: boolean; text: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
        <div>
          <p className="font-semibold text-white">{title}</p>
          <p className="text-xs text-slate-400">{text}</p>
        </div>
      </div>
    </Card>
  );
}

function DistributionCard({ title, values }: { title: string; values?: Record<string, number> }) {
  const rows = Object.entries(values || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...rows.map(([, v]) => v), 1);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>Live aggregate distribution from backend analytics.</CardDescription></CardHeader>
      <div className="space-y-3">
        {rows.length ? rows.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-sm text-slate-300"><span>{label}</span><span>{fmtNum(value)}</span></div>
            <div className="h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-blue-400" style={{ width: `${(value / max) * 100}%` }} /></div>
          </div>
        )) : <p className="text-sm text-slate-500">No data yet. Run discovery first.</p>}
      </div>
    </Card>
  );
}

function ListCard({ title, items }: { title: string; items: Array<Record<string, unknown>> }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>Top high and critical datasets by score.</CardDescription></CardHeader>
      <div className="space-y-3">
        {items.length ? items.slice(0, 8).map((item, index) => (
          <div key={index} className="flex items-center justify-between rounded-2xl bg-slate-950/45 p-3">
            <div><p className="font-medium text-white">{String(item.datasetId || item.entityName || "dataset")}</p><p className="text-xs text-slate-500">{String(item.sourceName || item.reason || "Governance catalog")}</p></div>
            <Badge>{titleize(item.riskLevel || item.level)} · {fmtNum(item.riskScore || item.score)}</Badge>
          </div>
        )) : <p className="text-sm text-slate-500">No high-risk datasets yet.</p>}
      </div>
    </Card>
  );
}

function SourceBreakdown({ sources }: { sources: Array<{ sourceType: string; sourceName: string; datasets: number; scannedRecords: number; sensitiveRecords: number; maxRisk: string }> }) {
  return (
    <Card>
      <CardHeader><CardTitle>Source Breakdown</CardTitle><CardDescription>Scanned records, sensitive records, and maximum risk by source.</CardDescription></CardHeader>
      <div className="space-y-3">
        {sources.length ? sources.slice(0, 8).map((source) => (
          <div key={`${source.sourceType}:${source.sourceName}`} className="grid grid-cols-4 gap-3 rounded-2xl bg-slate-950/45 p-3 text-sm">
            <div className="col-span-2"><p className="text-white">{source.sourceType} / {source.sourceName}</p><p className="text-xs text-slate-500">{fmtNum(source.datasets)} datasets</p></div>
            <div><p className="text-slate-500">Records</p><p className="text-white">{fmtNum(source.scannedRecords)}</p></div>
            <div><p className="text-slate-500">Risk</p><p className="text-white">{titleize(source.maxRisk)}</p></div>
          </div>
        )) : <p className="text-sm text-slate-500">No catalog sources yet.</p>}
      </div>
    </Card>
  );
}
