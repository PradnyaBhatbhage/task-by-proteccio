/* global Chart */

const STORAGE_KEY = "dashboardApiKey";

/** @type {Record<string, Chart>} */
const charts = {};

function getApiKey() {
  const input = document.getElementById("apiKey");
  return (input && input.value.trim()) || sessionStorage.getItem(STORAGE_KEY) || "";
}

function setBanner(kind, message) {
  const el = document.getElementById("banner");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("banner--hidden", "banner--error", "banner--ok");
  if (!message) {
    el.classList.add("banner--hidden");
    return;
  }
  el.classList.add(kind === "error" ? "banner--error" : "banner--ok");
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function horizontalBarChart(canvasId, labels, values, label, colors) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  const ctx = canvas.getContext("2d");
  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          backgroundColor: colors,
          borderRadius: 4
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "#8b9cb3" } },
        y: { grid: { display: false }, ticks: { color: "#c5d0e0" } }
      }
    }
  });
}

function doughnutChart(canvasId, labels, values, colors) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  const ctx = canvas.getContext("2d");
  charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: { color: "#c5d0e0", boxWidth: 12, padding: 10 }
        }
      }
    }
  });
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString();
}

function fmtPct01(x) {
  if (x == null || Number.isNaN(x)) return "—";
  return `${Math.round(x * 1000) / 10}%`;
}

function riskPillClass(level) {
  const k = String(level || "").toLowerCase();
  if (k === "low") return "risk-pill risk-pill--low";
  if (k === "medium") return "risk-pill risk-pill--medium";
  if (k === "high") return "risk-pill risk-pill--high";
  if (k === "critical") return "risk-pill risk-pill--critical";
  return "risk-pill";
}

function renderKpis(data) {
  const el = document.getElementById("kpis");
  if (!el) return;
  const c = data.catalogAndInventoryCounts || {};
  const items = [
    { label: "Scanned records", value: fmtNum(data.totalScannedRecords) },
    { label: "Sensitive records", value: fmtNum(data.totalSensitiveRecords) },
    { label: "High-risk sources", value: fmtNum(data.highRiskSourceCount) },
    { label: "Datasets (catalog)", value: fmtNum(c.datasetsInCatalog) },
    { label: "Systems (mapping)", value: fmtNum(c.systemsInMapping) },
    { label: "Mapped fields", value: fmtNum(c.mappedFields) },
    { label: "Data flows", value: fmtNum(c.dataFlows) },
    { label: "Duplicate groups", value: fmtNum(c.duplicateSensitiveGroups) }
  ];
  el.innerHTML = items
    .map(
      (x) => `
    <div class="kpi">
      <div class="kpi__value">${x.value}</div>
      <div class="kpi__label">${x.label}</div>
    </div>`
    )
    .join("");
}

function renderMapping(data) {
  const el = document.getElementById("mappingCards");
  if (!el) return;
  const m = data.mappingRelationships || {};
  const cards = [
    ["Systems", m.systems],
    ["Datasets", m.datasets],
    ["Mapped fields", m.mappedFields],
    ["Data flows", m.dataFlows],
    ["Duplicate groups", m.duplicateSensitiveGroups]
  ];
  el.innerHTML = cards
    .map(
      ([k, v]) => `
    <div class="stat-card">
      <div class="stat-card__v">${fmtNum(v)}</div>
      <div class="stat-card__k">${k}</div>
    </div>`
    )
    .join("");

  const flowWrap = document.getElementById("chartFlows")?.parentElement;
  if (flowWrap) flowWrap.querySelectorAll(".empty-hint").forEach((n) => n.remove());

  const kinds = m.flowsByKind || {};
  const labels = Object.keys(kinds);
  const values = labels.map((l) => kinds[l]);
  if (labels.length === 0) {
    destroyChart("chartFlows");
    const canvas = document.getElementById("chartFlows");
    if (canvas?.parentElement) {
      const hint = document.createElement("p");
      hint.className = "empty-hint muted";
      hint.textContent = "No data flows registered yet.";
      canvas.parentElement.appendChild(hint);
    }
  } else {
    horizontalBarChart(
      "chartFlows",
      labels,
      values,
      "Flows",
      labels.map(() => "rgba(61, 139, 253, 0.65)")
    );
  }
}

function renderProfiling(data) {
  const el = document.getElementById("profilingCards");
  if (!el) return;
  const p = data.profilingStatistics || {};
  const cards = [
    ["Datasets profiled", fmtNum(p.datasetsProfiled)],
    ["Avg. completeness", fmtPct01(p.averageDataCompleteness)],
    ["Anomalies", fmtNum(p.totalAnomalies)],
    ["Sensitive findings", fmtNum(p.totalSensitiveFindings)],
    ["Avg. findings / sensitive record", p.averageFindingsPerSensitiveRecord != null ? fmtNum(p.averageFindingsPerSensitiveRecord) : "—"]
  ];
  el.innerHTML = cards
    .map(
      ([k, v]) => `
    <div class="stat-card">
      <div class="stat-card__v">${v}</div>
      <div class="stat-card__k">${k}</div>
    </div>`
    )
    .join("");
}

function renderSources(data) {
  const tbody = document.querySelector("#sourceTable tbody");
  if (!tbody) return;
  const entries = Object.values(data.sourceWiseBreakdown || {});
  entries.sort((a, b) => (b.scannedRecords || 0) - (a.scannedRecords || 0));
  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-hint">No catalog datasets yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = entries
    .map((row) => {
      const src = `${row.sourceType} / ${row.sourceName}`;
      const risk = String(row.maxRisk || "").toLowerCase();
      return `<tr>
      <td>${escapeHtml(src)}</td>
      <td>${fmtNum(row.datasets)}</td>
      <td>${fmtNum(row.scannedRecords)}</td>
      <td>${fmtNum(row.sensitiveRecords)}</td>
      <td><span class="${riskPillClass(risk)}">${escapeHtml(row.maxRisk || "—")}</span></td>
    </tr>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function recordChartFromRecord(rec, canvasId, label, colorHue) {
  const keys = Object.keys(rec).sort((a, b) => (rec[b] || 0) - (rec[a] || 0));
  const labels = keys;
  const values = keys.map((k) => rec[k] || 0);
  const colors = keys.map((_, i) => `hsla(${colorHue + i * 18}, 65%, 52%, 0.75)`);
  if (keys.length === 0) {
    destroyChart(canvasId);
    return;
  }
  horizontalBarChart(canvasId, labels, values, label, colors);
}

async function loadDashboard() {
  setBanner("", "");
  const key = getApiKey();
  const headers = {};
  if (key) headers["X-API-Key"] = key;

  let res;
  try {
    res = await fetch("/api/dashboard/analytics", { headers });
  } catch (e) {
    setBanner("error", `Network error: ${e && e.message ? e.message : "failed to fetch"}`);
    return;
  }

  if (res.status === 401) {
    setBanner(
      "error",
      "Unauthorized (401). Enter the same API key as in your server .env (API_KEY), then click Refresh."
    );
    return;
  }

  if (!res.ok) {
    const t = await res.text();
    setBanner("error", `Request failed (${res.status}): ${t.slice(0, 200)}`);
    return;
  }

  const data = await res.json();
  setBanner("ok", "Loaded latest aggregates.");

  const gen = document.getElementById("generatedAt");
  if (gen) gen.textContent = data.generatedAt ? `Generated at ${data.generatedAt}` : "";

  renderKpis(data);

  const rd = data.riskDistribution || {};
  doughnutChart(
    "chartRisk",
    ["Low", "Medium", "High", "Critical"],
    [rd.low || 0, rd.medium || 0, rd.high || 0, rd.critical || 0],
    ["#34c759", "#ffcc00", "#ff6b6b", "#c44cff"]
  );

  recordChartFromRecord(data.classificationDistribution?.catalogLabelTotals || {}, "chartClassCatalog", "Labels", 200);
  recordChartFromRecord(
    data.classificationDistribution?.mappedFieldLabelTotals || {},
    "chartClassMapped",
    "Labels",
    280
  );

  recordChartFromRecord(
    data.discoveryStatistics?.catalogCategoryTotals || {},
    "chartDiscCatalog",
    "Detections",
    210
  );
  recordChartFromRecord(
    data.discoveryStatistics?.mappedFieldRowsByCategory || {},
    "chartDiscMapped",
    "Rows",
    300
  );

  renderMapping(data);
  renderProfiling(data);
  renderSources(data);
}

function init() {
  const saved = sessionStorage.getItem(STORAGE_KEY);
  const input = document.getElementById("apiKey");
  if (input && saved) input.value = saved;

  document.getElementById("btnRefresh")?.addEventListener("click", () => loadDashboard());
  document.getElementById("btnSaveKey")?.addEventListener("click", () => {
    const v = document.getElementById("apiKey")?.value.trim() || "";
    if (v) sessionStorage.setItem(STORAGE_KEY, v);
    else sessionStorage.removeItem(STORAGE_KEY);
    setBanner("ok", v ? "API key saved in this browser session." : "Cleared saved API key.");
  });

  loadDashboard();
}

document.addEventListener("DOMContentLoaded", init);
