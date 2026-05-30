"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { API_BASE_URL, apiFetch, getSession } from "@/lib/api";
import { titleize } from "@/lib/format";

type ReportRecord = {
  id: string;
  title: string;
  summary: string;
  reportType: string;
  generatedAt: string;
  primaryFormat: string;
};

type GenerateResponse = {
  async?: boolean;
  message?: string;
  report?: {
    id: string;
    generatedAt: string;
    download?: { format: string; fileName: string; contentType: string; encoding?: string; data: string };
  };
};

export default function ReportsPage() {
  const [reportType, setReportType] = useState("executive_summary");
  const [format, setFormat] = useState("json");
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const data = await apiFetch<{ items: ReportRecord[] }>("/api/reports?pageSize=20");
      setReports(data.items || []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function downloadGenerated(data: GenerateResponse) {
    const download = data.report?.download;
    if (!download) return;
    const blob =
      download.encoding === "base64"
        ? base64ToBlob(download.data, download.contentType)
        : new Blob([download.data], { type: download.contentType });
    triggerDownload(blob, download.fileName);
  }

  async function generate() {
    setMessage("");
    setGenerating(true);
    try {
      const data = await apiFetch<GenerateResponse>("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ reportType, format, tags: ["week4", "react-dashboard"] })
      });
      if (data.async) setMessage(data.message || "Report queued.");
      else {
        downloadGenerated(data);
        setMessage(`Generated ${data.report?.download?.fileName || "report"}.`);
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function downloadStored(id: string, selectedFormat: string) {
    const session = getSession();
    const res = await fetch(`${API_BASE_URL}/api/reports/${id}/download?format=${encodeURIComponent(selectedFormat)}`, {
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {}
    });
    if (!res.ok) {
      setMessage(`Download failed (${res.status}).`);
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    triggerDownload(blob, match?.[1] || `proteccio-report.${selectedFormat}`);
  }

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>Reporting</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Audit-ready reporting and exports</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Generate discovery, compliance, risk, source-wise, remediation, and executive reports in PDF, CSV, or JSON.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Generate Report</CardTitle><CardDescription>Download is triggered automatically when generation completes synchronously.</CardDescription></CardHeader>
        <div className="flex flex-wrap gap-3">
          <Select value={reportType} onChange={(e) => setReportType(e.target.value)} className="max-w-xs">
            <option value="discovery">Discovery report</option><option value="executive_summary">Executive summary</option><option value="privacy_risk">Privacy risk</option><option value="compliance">Compliance</option><option value="source_discovery">Source discovery</option><option value="classification_summary">Classification summary</option><option value="remediation">Remediation</option>
          </Select>
          <Select value={format} onChange={(e) => setFormat(e.target.value)} className="max-w-36"><option value="json">JSON</option><option value="csv">CSV</option><option value="pdf">PDF</option></Select>
          <Button onClick={() => void generate()} disabled={generating}>{generating ? "Generating..." : "Generate report"}</Button>
          <Button variant="secondary" onClick={() => void load()}>Refresh history</Button>
        </div>
        {message ? <p className="mt-4 text-sm text-blue-100">{message}</p> : null}
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Historical Reports</CardTitle><CardDescription>Stored report history with format-specific downloads.</CardDescription></CardHeader>
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-400"><tr><th className="p-3">Report</th><th className="p-3">Type</th><th className="p-3">Generated</th><th className="p-3">Download</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4} className="p-6 text-center text-slate-500">Loading report history...</td></tr> : reports.length ? reports.map((report) => (
                <tr key={report.id} className="border-t border-slate-800">
                  <td className="p-3"><p className="font-medium text-white">{report.title}</p><p className="text-xs text-slate-500">{report.summary}</p></td>
                  <td className="p-3 text-slate-300">{titleize(report.reportType)}</td>
                  <td className="p-3 text-slate-300">{report.generatedAt}</td>
                  <td className="p-3"><div className="flex gap-2"><Button variant="ghost" onClick={() => void downloadStored(report.id, "json")}>JSON</Button><Button variant="ghost" onClick={() => void downloadStored(report.id, "csv")}>CSV</Button><Button variant="ghost" onClick={() => void downloadStored(report.id, "pdf")}>PDF</Button></div></td>
                </tr>
              )) : <tr><td colSpan={4} className="p-6 text-center text-slate-500">No reports generated yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function base64ToBlob(base64: string, contentType: string) {
  const bytes = atob(base64);
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 1024) {
    const slice = bytes.slice(i, i + 1024);
    const nums = new Array(slice.length);
    for (let j = 0; j < slice.length; j += 1) nums[j] = slice.charCodeAt(j);
    chunks.push(new Uint8Array(nums));
  }
  return new Blob(chunks, { type: contentType });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
