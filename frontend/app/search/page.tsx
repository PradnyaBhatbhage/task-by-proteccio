"use client";

import type React from "react";
import { FormEvent, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { fmtNum, titleize } from "@/lib/format";

type SearchResult = {
  datasets?: { items?: Array<Record<string, any>>; total?: number; page?: number; pageSize?: number; hasMore?: boolean };
  remediation?: { items?: Array<Record<string, any>>; total?: number };
  global?: Record<string, any>;
  query?: Record<string, any>;
};

export default function SearchPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    q: "",
    classification: "",
    riskLevel: "",
    sourceName: "",
    complianceRegulation: "",
    status: "",
    sortBy: "updatedAt",
    sortOrder: "desc",
    pageSize: "10"
  });

  async function run(nextPage = page) {
    setError("");
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (filters.complianceRegulation) params.set("complianceViolation", "true");
    params.set("page", String(nextPage));
    try {
      setResult(await apiFetch<SearchResult>(`/api/search/advanced?${params.toString()}`));
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(1);
  }

  const datasets = result?.datasets;
  const remediation = result?.remediation;

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>Advanced Search</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Global search and record exploration</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Filter by classification, risk, source, compliance type, remediation status, keyword, pagination, and sorting.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Search Filters</CardTitle><CardDescription>Use narrow filters for faster governance exploration.</CardDescription></CardHeader>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          <Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Keyword" />
          <Select value={filters.classification} onChange={(e) => setFilters({ ...filters, classification: e.target.value })}>
            <option value="">Any classification</option><option>Personal Data</option><option>Sensitive Personal Data</option><option>Financial Data</option><option>Health Data</option><option>Authentication Data</option><option>Organizational Confidential Data</option><option>Public Data</option>
          </Select>
          <Select value={filters.riskLevel} onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })}>
            <option value="">Any risk</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
          </Select>
          <Input value={filters.sourceName} onChange={(e) => setFilters({ ...filters, sourceName: e.target.value })} placeholder="Source name" />
          <Select value={filters.complianceRegulation} onChange={(e) => setFilters({ ...filters, complianceRegulation: e.target.value })}>
            <option value="">Any compliance</option><option value="GDPR">GDPR</option><option value="DPDP">DPDP</option><option value="HIPAA">HIPAA</option><option value="CCPA">CCPA</option><option value="ISO27001">ISO 27001</option>
          </Select>
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Any remediation</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </Select>
          <Select value={filters.sortBy} onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}>
            <option value="updatedAt">Updated</option><option value="riskScore">Risk score</option><option value="riskLevel">Risk level</option><option value="sourceName">Source</option><option value="complianceScore">Compliance score</option>
          </Select>
          <Select value={filters.sortOrder} onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value })}><option value="desc">Desc</option><option value="asc">Asc</option></Select>
          <Button disabled={loading}>{loading ? "Searching..." : "Apply filters"}</Button>
        </form>
      </Card>

      {error ? <Card className="mt-6 border-red-400/30 bg-red-500/10 text-red-100">{error}</Card> : null}
      {result ? <div className="mt-6 flex flex-wrap gap-2"><Badge>{fmtNum(datasets?.total)} datasets</Badge><Badge>{fmtNum(remediation?.total)} remediation</Badge><Badge>{fmtNum(result.global?.fields?.total)} fields</Badge><Badge>Sorted by {titleize(result.query?.sortBy)} {result.query?.sortOrder}</Badge></div> : null}

      <Card className="mt-6">
        <CardHeader><CardTitle>Dataset Results</CardTitle><CardDescription>Matching catalog datasets and risk posture.</CardDescription></CardHeader>
        <Table rows={datasets?.items || []} columns={["Dataset", "Source", "Classification", "Risk", "Compliance", "Records"]} render={(item) => [
          <Cell key="d" title={item.trace?.entityName || item.datasetId} sub={item.datasetId} />,
          `${item.trace?.sourceType || "source"} / ${item.trace?.sourceName || "unknown"}`,
          Object.keys(item.classificationTotals || {}).filter((k) => item.classificationTotals[k] > 0).slice(0, 3).join(", ") || "Unclassified",
          `${titleize(item.riskLevel)} (${fmtNum(item.risk?.score)})`,
          titleize(item.risk?.analysis?.complianceIntelligence?.status || "not_applicable"),
          `${fmtNum(item.totalRecords)} total / ${fmtNum(item.sensitiveRecordCount)} sensitive`
        ]} />
        <div className="mt-4 flex items-center justify-between">
          <Button variant="secondary" disabled={page <= 1} onClick={() => void run(page - 1)}>Previous</Button>
          <span className="text-sm text-slate-400">Page {page}</span>
          <Button variant="secondary" disabled={!datasets?.hasMore} onClick={() => void run(page + 1)}>Next</Button>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Matching Remediation</CardTitle><CardDescription>Tickets matching the same filters.</CardDescription></CardHeader>
        <Table rows={remediation?.items || []} columns={["Ticket", "Dataset", "Status", "Severity", "Action"]} render={(ticket) => [
          <Cell key="t" title={ticket.id} sub={ticket.riskType} />,
          ticket.datasetId || ticket.source || "n/a",
          titleize(ticket.status),
          titleize(ticket.severity),
          String(ticket.suggestedAction || "").slice(0, 140)
        ]} />
      </Card>
    </AppShell>
  );
}

function Cell({ title, sub }: { title: unknown; sub?: unknown }) {
  return <span><strong className="text-white">{String(title)}</strong>{sub ? <><br /><span className="text-xs text-slate-500">{String(sub)}</span></> : null}</span>;
}

function Table({ rows, columns, render }: { rows: Array<Record<string, any>>; columns: string[]; render: (row: Record<string, any>) => React.ReactNode[] }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-800"><table className="min-w-[860px] w-full text-left text-sm"><thead className="bg-slate-950/60 text-slate-400"><tr>{columns.map((c) => <th key={c} className="p-3">{c}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={String(row.id || row.datasetId || i)} className="border-t border-slate-800">{render(row).map((cell, idx) => <td key={idx} className="p-3 text-slate-300">{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="p-6 text-center text-slate-500">No results yet.</td></tr>}</tbody></table></div>;
}
