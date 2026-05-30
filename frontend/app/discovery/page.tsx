"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

const sampleRecords = `[
  {"email":"riya@example.com","phone":"+91 9876543210","aadhaar":"2345 6789 0123","city":"Pune"},
  {"email":"alex@example.com","pan":"ABCDE1234F","diagnosis":"diabetes","amount":4500}
]`;

export default function DiscoveryPage() {
  const [records, setRecords] = useState(sampleRecords);
  const [output, setOutput] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function runDiscovery() {
    setLoading(true);
    setMessage("");
    try {
      const parsed = JSON.parse(records);
      const data = await apiFetch<Record<string, unknown>>("/api/workflow/run", {
        method: "POST",
        body: JSON.stringify({
          records: parsed,
          sourceType: "file",
          sourceName: "next-frontend-workbench",
          entityName: "sample-records.json",
          createRemediation: true,
          reportFormat: "json"
        })
      });
      setOutput(data);
      setMessage("End-to-end workflow completed: discovery, classification, mapping, profiling, risk, remediation, report, and dashboard refresh.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Workflow failed");
    } finally {
      setLoading(false);
    }
  }

  const summary = output as {
    discovery?: { scannedRecords?: number; summary?: Record<string, number> };
    classification?: { summary?: Record<string, number> };
    risk?: { level?: string; score?: number };
    remediation?: { created?: unknown[] };
  } | null;

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>Discovery Workflow</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Discover, classify, and govern sensitive data</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Paste records and run the complete Week 4 workflow against the backend: discovery, classification, mapping, profiling, risk, compliance,
          remediation, and reporting.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Record Exploration Input</CardTitle>
            <CardDescription>Use masked samples only. Raw sensitive values should not be logged or exported.</CardDescription>
          </CardHeader>
          <Textarea value={records} onChange={(e) => setRecords(e.target.value)} />
          <Button className="mt-4 w-full" onClick={runDiscovery} disabled={loading}>
            {loading ? "Running workflow..." : "Run discovery workflow"}
          </Button>
          {message ? <p className="mt-4 text-sm text-blue-100">{message}</p> : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Classification Results</CardTitle>
            <CardDescription>Human-readable summary of the latest run.</CardDescription>
          </CardHeader>
          {summary ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Records scanned" value={summary.discovery?.scannedRecords ?? 0} />
                <Metric label="Risk level" value={summary.risk?.level ?? "n/a"} />
                <Metric label="Tickets created" value={summary.remediation?.created?.length ?? 0} />
              </div>
              <SummaryBlock title="Discovery Categories" data={summary.discovery?.summary} />
              <SummaryBlock title="Classification Labels" data={summary.classification?.summary} />
              <pre className="max-h-96 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300">
                {JSON.stringify(output, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">
              Run a workflow to see detection insights and record exploration results.
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-slate-950/45 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function SummaryBlock({ title, data }: { title: string; data?: Record<string, number> }) {
  const rows = Object.entries(data ?? {});
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-white">{title}</p>
      <div className="flex flex-wrap gap-2">
        {rows.length ? rows.map(([key, value]) => <Badge key={key}>{key}: {value}</Badge>) : <span className="text-sm text-slate-500">No findings</span>}
      </div>
    </div>
  );
}
