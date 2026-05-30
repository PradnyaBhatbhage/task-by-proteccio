"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { fmtNum, titleize } from "@/lib/format";

type Analytics = {
  mappingRelationships?: Record<string, any>;
  sourceRiskHeatmap?: { riskLevels?: string[]; sources?: Array<Record<string, any>> };
};

type SourceSystem = {
  id: string;
  sourceType: string;
  sourceName: string;
};

type Dataset = {
  id: string;
  systemId: string;
  entityName: string;
};

type DataFlow = {
  id: string;
  fromDatasetId: string;
  toDatasetId: string;
  flowKind: string;
  description?: string;
};

type MappedField = {
  id: string;
  datasetId: string;
  systemId?: string;
  logicalFieldKey: string;
  sensitiveCategory: string;
  jsonPath: string;
};

type MappingInventory = {
  systems: SourceSystem[];
  datasets: Dataset[];
  flows: DataFlow[];
  fields: MappedField[];
};

export default function MappingPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [fields, setFields] = useState<MappedField[]>([]);
  const [inventory, setInventory] = useState<MappingInventory | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [a, f, inventoryResult] = await Promise.all([
          apiFetch<Analytics>("/api/dashboard/analytics"),
          apiFetch<{ items: MappedField[] }>("/api/search/mapped-fields?pageSize=20"),
          apiFetch<MappingInventory>("/api/mapping/export")
        ]);
        setAnalytics(a);
        setFields(f.items || []);
        setInventory(inventoryResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Mapping load failed");
      }
    }
    void load();
  }, []);

  const m = analytics?.mappingRelationships || {};
  const heatmap = analytics?.sourceRiskHeatmap || {};
  const levels = heatmap.riskLevels || ["low", "medium", "high", "critical"];
  const heatmapSources = heatmap.sources || [];

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>Mapping & Lineage</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Source relationships and sensitive-field lineage</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Visualize systems, datasets, mapped fields, data flows, duplicate groups, and source risk concentration.</p>
      </div>
      {error ? <Card className="mb-6 border-red-400/30 bg-red-500/10 text-red-100">{error}</Card> : null}

      <section className="grid gap-4 md:grid-cols-5">
        {[
          ["Systems", m.systems],
          ["Datasets", m.datasets],
          ["Mapped fields", m.mappedFields],
          ["Data flows", m.dataFlows],
          ["Duplicate groups", m.duplicateSensitiveGroups]
        ].map(([label, value]) => <Metric key={String(label)} label={String(label)} value={value} />)}
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Data Lineage Visualization</CardTitle>
          <CardDescription>Graphical relationship map from source systems to datasets, sensitive fields, and declared dataset-to-dataset flows.</CardDescription>
        </CardHeader>
        <LineageGraph inventory={inventory} fallbackFields={fields} />
      </Card>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Data Flows By Kind</CardTitle><CardDescription>Directional relationships between datasets.</CardDescription></CardHeader>
          <div className="space-y-3">
            {Object.entries(m.flowsByKind || {}).length ? Object.entries(m.flowsByKind || {}).map(([kind, count]) => (
              <div key={kind} className="flex items-center justify-between rounded-2xl bg-slate-950/45 p-3">
                <span className="text-slate-300">{titleize(kind)}</span><Badge>{fmtNum(count)}</Badge>
              </div>
            )) : <p className="text-sm text-slate-500">No data flows registered yet.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Source Risk Heatmap</CardTitle><CardDescription>Risk-level totals by source.</CardDescription></CardHeader>
          <div className="space-y-2">
            {heatmapSources.length ? heatmapSources.slice(0, 8).map((source) => (
              <div key={source.key} className="grid grid-cols-6 gap-2 rounded-2xl bg-slate-950/45 p-3 text-sm">
                <span className="col-span-2 truncate text-white">{source.sourceName}</span>
                {levels.map((level) => <span key={level} className="rounded-lg bg-slate-800 px-2 py-1 text-center text-slate-300">{fmtNum(source.totals?.[level])}</span>)}
              </div>
            )) : <p className="text-sm text-slate-500">No source risk matrix yet.</p>}
          </div>
        </Card>
      </section>

      <Card className="mt-6">
        <CardHeader><CardTitle>Lineage Field Inventory</CardTitle><CardDescription>Recent mapped sensitive fields from discovery results.</CardDescription></CardHeader>
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-400"><tr><th className="p-3">Dataset</th><th className="p-3">Field</th><th className="p-3">Category</th><th className="p-3">Path</th></tr></thead>
            <tbody>
              {fields.length ? fields.map((field) => (
                <tr key={field.id} className="border-t border-slate-800"><td className="p-3 text-slate-300">{field.datasetId}</td><td className="p-3 text-white">{field.logicalFieldKey}</td><td className="p-3 text-slate-300">{field.sensitiveCategory}</td><td className="p-3 text-slate-400">{field.jsonPath}</td></tr>
              )) : <tr><td colSpan={4} className="p-6 text-center text-slate-500">No mapped fields yet. Run discovery first.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <Card className="p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-semibold text-white">{fmtNum(value)}</p></Card>;
}

function LineageGraph({ inventory, fallbackFields }: { inventory: MappingInventory | null; fallbackFields: MappedField[] }) {
  const systems = (inventory?.systems || []).slice(0, 4);
  const datasets = (inventory?.datasets || []).slice(0, 6);
  const fields = ((inventory?.fields?.length ? inventory.fields : fallbackFields) || []).slice(0, 8);
  const flows = (inventory?.flows || []).slice(0, 6);

  if (!systems.length && !datasets.length && !fields.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center">
        <p className="text-sm font-semibold text-white">No lineage graph yet</p>
        <p className="mt-2 text-sm text-slate-500">Run discovery or register mapping datasets to populate the visual relationship graph.</p>
      </div>
    );
  }

  const systemNodes = systems.map((system, index) => ({
    id: system.id,
    label: system.sourceName,
    sub: system.sourceType,
    kind: "system" as const,
    x: spreadX(index, systems.length),
    y: 58
  }));

  const datasetNodes = datasets.map((dataset, index) => ({
    id: dataset.id,
    label: dataset.entityName,
    sub: "dataset",
    kind: "dataset" as const,
    x: spreadX(index, datasets.length),
    y: 190
  }));

  const fieldNodes = fields.map((field, index) => ({
    id: field.id,
    label: field.logicalFieldKey,
    sub: field.sensitiveCategory,
    kind: "field" as const,
    x: spreadX(index, fields.length),
    y: 325
  }));

  const allNodes = [...systemNodes, ...datasetNodes, ...fieldNodes];
  const nodeMap = new Map(allNodes.map((node) => [node.id, node]));
  const edges: Array<{ from: string; to: string; label?: string; dashed?: boolean }> = [];

  for (const dataset of datasets) {
    if (nodeMap.has(dataset.systemId) && nodeMap.has(dataset.id)) {
      edges.push({ from: dataset.systemId, to: dataset.id });
    }
  }
  for (const field of fields) {
    if (nodeMap.has(field.datasetId) && nodeMap.has(field.id)) {
      edges.push({ from: field.datasetId, to: field.id });
    }
  }
  for (const flow of flows) {
    if (nodeMap.has(flow.fromDatasetId) && nodeMap.has(flow.toDatasetId)) {
      edges.push({ from: flow.fromDatasetId, to: flow.toDatasetId, label: titleize(flow.flowKind), dashed: true });
    }
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/45 p-4">
      <svg viewBox="0 0 1000 420" className="min-h-[360px] w-full min-w-[860px]" role="img" aria-label="Data lineage graph">
        <defs>
          <marker id="lineage-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#60a5fa" />
          </marker>
          <linearGradient id="lineage-node" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        <text x="32" y="26" fill="currentColor" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Sources</text>
        <text x="32" y="158" fill="currentColor" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Datasets</text>
        <text x="32" y="292" fill="currentColor" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Sensitive Fields</text>

        {edges.map((edge, index) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const sameLayer = from.y === to.y;
          const path = sameLayer
            ? `M ${from.x + 78} ${from.y} C ${from.x + 120} ${from.y - 70}, ${to.x - 120} ${to.y - 70}, ${to.x - 78} ${to.y}`
            : `M ${from.x} ${from.y + 34} C ${from.x} ${(from.y + to.y) / 2}, ${to.x} ${(from.y + to.y) / 2}, ${to.x} ${to.y - 34}`;
          return (
            <g key={`${edge.from}-${edge.to}-${index}`}>
              <path d={path} fill="none" stroke="#60a5fa" strokeOpacity="0.42" strokeWidth="2" strokeDasharray={edge.dashed ? "7 7" : undefined} markerEnd="url(#lineage-arrow)" />
              {edge.label ? <text x={(from.x + to.x) / 2 - 22} y={Math.min(from.y, to.y) - 42} fill="#93c5fd" className="text-[10px] font-semibold">{edge.label}</text> : null}
            </g>
          );
        })}

        {allNodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x - 78}, ${node.y - 34})`}>
            <rect width="156" height="68" rx="16" fill={node.kind === "field" ? "rgba(15, 23, 42, 0.72)" : "url(#lineage-node)"} stroke={node.kind === "field" ? "rgba(148, 163, 184, 0.36)" : "rgba(96, 165, 250, 0.42)"} />
            <text x="14" y="28" fill="currentColor" className="text-sm font-semibold text-white">{truncateLabel(node.label, 18)}</text>
            <text x="14" y="48" fill="currentColor" className="text-xs text-slate-400">{truncateLabel(titleize(node.sub), 22)}</text>
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
        <Badge>Solid arrows: source to dataset to sensitive field</Badge>
        <Badge>Dashed arrows: declared dataset relationship flow</Badge>
      </div>
    </div>
  );
}

function spreadX(index: number, count: number) {
  if (count <= 1) return 500;
  const min = 130;
  const max = 870;
  return min + (index * (max - min)) / (count - 1);
}

function truncateLabel(value: unknown, max: number) {
  const text = String(value ?? "unknown");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}
