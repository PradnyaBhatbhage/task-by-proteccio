"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { apiFetch, apiFormFetch } from "@/lib/api";

type SourceItem = {
  id: string;
  name: string;
  type: string;
  status: string;
  owner?: string;
  environment: string;
  connection?: Record<string, string | number>;
  lastCheckedAt?: string;
  lastScanAt?: string;
  supabaseSync?: { enabled: boolean; ok: boolean };
};

const MAX_UPLOAD_BYTES = 52_428_800;
const ALLOWED_EXTENSIONS = [".csv", ".json", ".txt", ".xlsx", ".pdf", ".pst", ".ost"];
const RISKY_INNER_EXTENSIONS = [".exe", ".bat", ".cmd", ".com", ".dll", ".js", ".vbs", ".ps1", ".scr"];
const ALLOWED_MIME_BY_EXTENSION: Record<string, string[]> = {
  ".csv": ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"],
  ".json": ["application/json", "text/json", "text/plain"],
  ".txt": ["text/plain"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
  ".pdf": ["application/pdf", "application/octet-stream"],
  ".pst": ["application/vnd.ms-outlook", "application/octet-stream"],
  ".ost": ["application/vnd.ms-outlook", "application/octet-stream"]
};

type FileValidationState = {
  fileName: string;
  sizeOk: boolean;
  extensionOk: boolean;
  mimeOk: boolean;
  doubleExtensionOk: boolean;
  sizeLabel: string;
  extension: string;
  mimeType: string;
};

export default function SourcesPage() {
  const [items, setItems] = useState<SourceItem[]>([]);
  const [message, setMessage] = useState("");
  const [loadingSources, setLoadingSources] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [fileValidation, setFileValidation] = useState<FileValidationState | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "postgres",
    endpoint: "",
    port: "",
    database: "",
    owner: "",
    environment: "development",
    secretRef: ""
  });

  async function load() {
    try {
      setLoadingSources(true);
      const data = await apiFetch<{ items: SourceItem[] }>("/api/sources");
      setItems(data.items || []);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load sources");
    } finally {
      setLoadingSources(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const connection: Record<string, string | number> = {
      authMode: form.secretRef ? "secret_ref" : "none"
    };
    if (form.secretRef) connection.secretRef = form.secretRef;
    if (form.type === "api") connection.url = form.endpoint;
    else if (form.type === "s3") {
      connection.bucket = form.endpoint;
      if (form.database) connection.prefix = form.database;
    } else if (form.type === "file") connection.fileName = form.endpoint;
    else {
      connection.host = form.endpoint;
      if (form.port) connection.port = Number(form.port);
      if (form.database) connection.database = form.database;
    }

    try {
      await apiFetch("/api/sources", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          owner: form.owner || undefined,
          environment: form.environment,
          connection,
          tags: ["next-frontend", "week4"]
        })
      });
      setMessage("Source registered successfully.");
      setForm({ name: "", type: "postgres", endpoint: "", port: "", database: "", owner: "", environment: "development", secretRef: "" });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Source registration failed");
    }
  }

  const statusCounts = {
    connected: countByStatus(items, "connected"),
    failed: countByStatus(items, "failed"),
    scanning: countByStatus(items, "scanning"),
    disabled: countByStatus(items, "disabled")
  };

  function validateSelectedFile(file: File | undefined) {
    if (!file) {
      setFileValidation(null);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setUploadResult(null);
    const safeName = file.name.trim().toLowerCase();
    const extension = extensionOf(safeName);
    const nameWithoutExtension = safeName.slice(0, safeName.length - extension.length);
    const innerExtension = extensionOf(nameWithoutExtension);
    const allowedMimes = ALLOWED_MIME_BY_EXTENSION[extension] || [];
    const mimeType = file.type || "application/octet-stream";
    setFileValidation({
      fileName: file.name,
      sizeOk: file.size <= MAX_UPLOAD_BYTES,
      extensionOk: ALLOWED_EXTENSIONS.includes(extension),
      doubleExtensionOk: !innerExtension || !RISKY_INNER_EXTENSIONS.includes(innerExtension),
      mimeOk: allowedMimes.length === 0 || allowedMimes.includes(mimeType.toLowerCase()),
      sizeLabel: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      extension: extension || "none",
      mimeType
    });
  }

  async function uploadSelectedFile() {
    if (!selectedFile || !fileValidation) {
      setMessage("Choose a valid file before uploading.");
      return;
    }
    if (!fileValidation.sizeOk || !fileValidation.extensionOk || !fileValidation.mimeOk || !fileValidation.doubleExtensionOk) {
      setMessage("Fix file validation errors before uploading.");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", selectedFile);
      body.append("discovery", "true");
      body.append("maxRecords", "50");
      const result = await apiFormFetch<Record<string, unknown>>("/api/ingest/file/preview", body);
      setUploadResult(result);
      setMessage("File uploaded, parsed, masked, and scanned successfully.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "File upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>Source Management</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Onboard data sources professionally</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Configure database, API, S3, and file sources with environment, owner, secret reference, and Supabase sync visibility.
        </p>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <StatusMetric label="Connected" value={statusCounts.connected} tone="connected" />
        <StatusMetric label="Failed" value={statusCounts.failed} tone="failed" />
        <StatusMetric label="Scanning" value={statusCounts.scanning} tone="scanning" />
        <StatusMetric label="Disabled" value={statusCounts.disabled} tone="disabled" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add New Source</CardTitle>
            <CardDescription>Connection secrets should be stored as external references, not raw credentials.</CardDescription>
          </CardHeader>
          <form onSubmit={submit} className="grid gap-4">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="customer-production-db" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="postgres">Postgres</option>
                <option value="mysql">MySQL</option>
                <option value="mongodb">MongoDB</option>
                <option value="api">API</option>
                <option value="s3">S3</option>
                <option value="file">File</option>
              </Select>
              <Select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
                <option value="development">Development</option>
                <option value="sandbox">Sandbox</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </Select>
            </div>
            <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="host, bucket, URL, or file name" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="Port" />
              <Input value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} placeholder="Database / prefix" />
            </div>
            <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Owner" />
            <Input value={form.secretRef} onChange={(e) => setForm({ ...form, secretRef: e.target.value })} placeholder="supabase-vault:prod/customer-db" />
            <Button>Register source</Button>
          </form>
          {message ? <p className="mt-4 text-sm text-blue-100">{message}</p> : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>File Upload Validation</CardTitle>
            <CardDescription>Visible client-side evidence for the same size, extension, and MIME rules enforced by the backend upload middleware.</CardDescription>
          </CardHeader>
          <div className="space-y-4">
            <Input
              type="file"
              accept={ALLOWED_EXTENSIONS.join(",")}
              onChange={(event) => validateSelectedFile(event.target.files?.[0])}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <ValidationRule title="File size" value={`Maximum ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB`} ok={fileValidation?.sizeOk} detail={fileValidation?.sizeLabel} />
              <ValidationRule title="Extension" value={ALLOWED_EXTENSIONS.join(", ")} ok={fileValidation?.extensionOk} detail={fileValidation?.extension} />
              <ValidationRule title="MIME type" value="Must match selected extension" ok={fileValidation?.mimeOk} detail={fileValidation?.mimeType} />
              <ValidationRule title="Double extension" value="Executable/script inner extensions blocked" ok={fileValidation?.doubleExtensionOk} detail={fileValidation?.fileName} />
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4 text-sm text-slate-400">
              <p className="font-semibold text-white">Backend enforcement</p>
              <p className="mt-1">multer rejects invalid size, unsupported extensions, mismatched MIME types, and risky double extensions before parsing or Supabase upload.</p>
            </div>
            <Button onClick={() => void uploadSelectedFile()} disabled={!selectedFile || uploading}>
              {uploading ? "Uploading and scanning..." : "Upload, preview, and scan"}
            </Button>
            {uploadResult ? (
              <div className="max-h-80 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300">
                <pre>{JSON.stringify(uploadResult, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle>Source Status Monitoring</CardTitle>
                <CardDescription>Live status refresh every 5 seconds for connected, failed, scanning, and disabled sources.</CardDescription>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  Live updates
                </span>
                <button type="button" onClick={() => void load()} className="text-xs font-semibold text-blue-200 hover:text-blue-100">
                  Refresh now
                </button>
                {lastUpdated ? <span className="text-xs text-slate-500">Last updated {lastUpdated}</span> : null}
              </div>
            </div>
          </CardHeader>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="p-3">Source</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Activity</th>
                  <th className="p-3">Sync</th>
                </tr>
              </thead>
              <tbody>
                {loadingSources ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">Loading sources...</td>
                  </tr>
                ) : items.length ? (
                  items.map((source) => (
                    <tr key={source.id} className="border-t border-slate-800">
                      <td className="p-3">
                        <p className="font-medium text-white">{source.name}</p>
                        <p className="text-xs text-slate-500">{source.owner || source.environment}</p>
                      </td>
                      <td className="p-3 text-slate-300">{source.type}</td>
                      <td className="p-3"><SourceStatusBadge status={source.status} /></td>
                      <td className="p-3 text-slate-300">
                        <p className="text-xs text-slate-500">Checked: {source.lastCheckedAt ? new Date(source.lastCheckedAt).toLocaleString() : "Not checked"}</p>
                        <p className="text-xs text-slate-500">Scan: {source.lastScanAt ? new Date(source.lastScanAt).toLocaleString() : "No scan yet"}</p>
                      </td>
                      <td className="p-3 text-slate-300">{source.supabaseSync?.enabled ? (source.supabaseSync.ok ? "Supabase" : "Failed") : "Local"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">No sources registered yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function countByStatus(items: SourceItem[], status: string) {
  return items.filter((item) => item.status === status).length;
}

function extensionOf(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot) : "";
}

function ValidationRule({ title, value, ok, detail }: { title: string; value: string; ok?: boolean; detail?: string }) {
  const checked = ok !== undefined;
  const tone = !checked
    ? "border-slate-500/30 bg-slate-500/10 text-slate-300"
    : ok
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : "border-red-400/30 bg-red-400/10 text-red-200";
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-xs font-bold">{!checked ? "Rule" : ok ? "Pass" : "Fail"}</span>
      </div>
      <p className="mt-1 text-xs opacity-80">{value}</p>
      {detail ? <p className="mt-2 break-all text-xs font-semibold">{detail}</p> : null}
    </div>
  );
}

function StatusMetric({ label, value, tone }: { label: string; value: number; tone: "connected" | "failed" | "scanning" | "disabled" }) {
  const colors = {
    connected: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    failed: "border-red-400/30 bg-red-400/10 text-red-200",
    scanning: "border-blue-400/30 bg-blue-400/10 text-blue-200",
    disabled: "border-slate-500/30 bg-slate-500/10 text-slate-300"
  };
  return (
    <Card className={`p-5 ${colors[tone]}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </Card>
  );
}

function SourceStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const color =
    normalized === "connected"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : normalized === "failed"
        ? "border-red-400/30 bg-red-400/10 text-red-200"
        : normalized === "scanning"
          ? "border-blue-400/30 bg-blue-400/10 text-blue-200"
          : normalized === "disabled"
            ? "border-slate-500/30 bg-slate-500/10 text-slate-300"
            : "border-amber-400/30 bg-amber-400/10 text-amber-200";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${color}`}>
      <span className={`h-2 w-2 rounded-full ${normalized === "scanning" ? "animate-pulse" : ""} ${dotColor(normalized)}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

function dotColor(status: string) {
  if (status === "connected") return "bg-emerald-400";
  if (status === "failed") return "bg-red-400";
  if (status === "scanning") return "bg-blue-400";
  if (status === "disabled") return "bg-slate-400";
  return "bg-amber-400";
}
