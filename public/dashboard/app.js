/* global Chart */

const API_KEY_STORAGE_KEY = "dashboardApiKey";
const TOKEN_STORAGE_KEY = "dashboardJwt";
const REFRESH_TOKEN_STORAGE_KEY = "dashboardRefreshToken";
const USER_STORAGE_KEY = "dashboardUserEmail";
const USER_PROFILE_STORAGE_KEY = "dashboardUserProfile";
const PERMISSIONS_STORAGE_KEY = "dashboardPermissions";
const SUPPORT_CACHE_TTL_MS = 30_000;

/** @type {Record<string, Chart>} */
const charts = {};
const trendHistory = [];
const responseCache = new Map();
let lastScanPayload = null;
let realtimeController = null;
let dashboardLoading = false;
let currentSearchPage = 1;
let lastSearchHasMore = false;
let lastDashboardSignature = "";

function getApiKey() {
  const input = document.getElementById("apiKey");
  return (input && input.value.trim()) || sessionStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

function getJwtToken() {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function getPermissions() {
  try {
    return JSON.parse(sessionStorage.getItem(PERMISSIONS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function hasPermission(permission) {
  const permissions = getPermissions();
  return permissions.includes(permission);
}

function storeSession(body, fallbackEmail) {
  if (body.token) sessionStorage.setItem(TOKEN_STORAGE_KEY, body.token);
  if (body.refreshToken) sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, body.refreshToken);
  if (body.user) sessionStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(body.user));
  if (body.permissions) sessionStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(body.permissions));
  sessionStorage.setItem(USER_STORAGE_KEY, body.user?.email || fallbackEmail || "");
  setLoginState(body.user?.email || fallbackEmail);
  applyAccessControls();
}

function authHeaders() {
  const token = getJwtToken();
  const key = getApiKey();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (key) headers["X-API-Key"] = key;
  return headers;
}

async function apiFetch(path, options = {}) {
  const headers = { ...authHeaders(), ...(options.headers || {}) };
  let res = await fetch(path, { ...options, headers });
  if (res.status === 401 && sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await fetch(path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text.slice(0, 240) || res.statusText}`);
  }
  return res;
}

async function cachedJson(path, ttlMs = SUPPORT_CACHE_TTL_MS, force = false) {
  const now = Date.now();
  const cached = responseCache.get(path);
  if (!force && cached && cached.expiresAt > now) return cached.value;
  const res = await apiFetch(path);
  const value = await res.json();
  responseCache.set(path, { value, expiresAt: now + ttlMs });
  return value;
}

function invalidateClientCache(prefix) {
  for (const key of responseCache.keys()) {
    if (!prefix || key.startsWith(prefix)) responseCache.delete(key);
  }
}

async function refreshSession() {
  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!refreshToken) return false;
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) return false;
    const body = await res.json();
    storeSession(body, body.user?.email);
    return true;
  } catch {
    return false;
  }
}

function setLoginState(email) {
  const loginEmail = document.getElementById("loginEmail");
  if (loginEmail && email) loginEmail.value = email;
  const user = JSON.parse(sessionStorage.getItem(USER_PROFILE_STORAGE_KEY) || "null");
  const session = document.getElementById("sessionState");
  if (session) {
    session.textContent = user
      ? `${user.displayName || user.email} (${String(user.role || "viewer").replace(/_/g, " ")})`
      : "Not signed in";
  }
}

function applyAccessControls() {
  document.querySelectorAll("[data-permission]").forEach((el) => {
    const required = el.getAttribute("data-permission");
    const allowed = !required || hasPermission(required);
    el.classList.toggle("is-hidden", !allowed);
    if ("disabled" in el) el.disabled = !allowed;
  });
}

function initNavigationState() {
  const links = [...document.querySelectorAll(".nav-link")];
  const setActive = (hash) => {
    links.forEach((link) => {
      link.classList.toggle("nav-link--active", link.getAttribute("href") === hash);
    });
  };
  links.forEach((link) => {
    link.addEventListener("click", () => setActive(link.getAttribute("href")));
  });
  setActive(window.location.hash || "#dashboard");
}

async function loadCurrentUser() {
  if (!getJwtToken()) {
    applyAccessControls();
    return;
  }
  try {
    const res = await apiFetch("/api/auth/me");
    const body = await res.json();
    storeSession({ user: body.user, permissions: body.permissions }, body.user?.email);
  } catch {
    applyAccessControls();
  }
}

async function login() {
  setBanner("", "");
  const email = document.getElementById("loginEmail")?.value.trim() || "superadmin@discover.app";
  const password = document.getElementById("loginPassword")?.value || "SuperAdmin1!";

  let res;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
  } catch (e) {
    setBanner("error", `Login network error: ${e && e.message ? e.message : "failed to fetch"}`);
    return;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    setBanner("error", `Login failed (${res.status}): ${body.message || body.error || "check credentials"}`);
    return;
  }

  storeSession(body, email);
  setBanner("ok", `Logged in as ${body.user?.email || email}. Loading dashboard...`);
  await loadUsers(true);
  await loadDashboard();
}

async function signup(evt) {
  evt.preventDefault();
  try {
    const email = document.getElementById("signupEmail")?.value.trim();
    const displayName = document.getElementById("signupName")?.value.trim();
    const password = document.getElementById("signupPassword")?.value || "";
    const res = await apiFetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, displayName, password })
    });
    const body = await res.json();
    storeSession(body, email);
    setBanner("ok", "Signup complete. New account is logged in as a viewer.");
    await loadUsers(true);
    await loadDashboard();
  } catch (err) {
    setBanner("error", `Signup failed: ${err.message}`);
  }
}

async function forgotPassword() {
  const email =
    document.getElementById("signupEmail")?.value.trim() ||
    document.getElementById("loginEmail")?.value.trim() ||
    "superadmin@discover.app";
  try {
    const res = await apiFetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const body = await res.json();
    setBanner("ok", body.message || "Password reset workflow accepted.");
  } catch (err) {
    setBanner("error", `Password reset failed: ${err.message}`);
  }
}

async function logout() {
  try {
    if (getJwtToken()) {
      await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
    }
  } catch {
    // Client-side session cleanup still happens if server-side revocation is unavailable.
  }
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(USER_PROFILE_STORAGE_KEY);
  sessionStorage.removeItem(PERMISSIONS_STORAGE_KEY);
  setLoginState("");
  applyAccessControls();
  setBanner("ok", "Logged out. Login again or use API key fallback.");
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

function setDashboardState(kind, message) {
  const el = document.getElementById("dashboardStatus");
  if (!el) return;
  el.classList.remove("dashboard-status--loading", "dashboard-status--error", "dashboard-status--live", "dashboard-status--ok");
  el.classList.add(`dashboard-status--${kind || "ok"}`);
  el.innerHTML = `<span class="status-dot ${kind === "error" ? "status-dot--warn" : "status-dot--ok"}"></span><span>${escapeHtml(message)}</span>`;
}

function setDashboardLoading(isLoading, message = "Loading dashboard data...") {
  dashboardLoading = isLoading;
  document.body.classList.toggle("is-dashboard-loading", isLoading);
  if (isLoading) setDashboardState("loading", message);
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

function lineChart(canvasId, labels, datasets) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  const ctx = canvas.getContext("2d");
  charts[canvasId] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#c5d0e0" }
        }
      },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#8b9cb3", maxRotation: 0 } },
        y: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "#8b9cb3" }, beginAtZero: true }
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
  renderSourceRiskHeatmap(data);
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
  renderExposedSystems(data);
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

function pushTrendPoint(data) {
  const stamp = data.generatedAt ? new Date(data.generatedAt) : new Date();
  const label = stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const latest = trendHistory[trendHistory.length - 1];
  if (latest?.generatedAt === data.generatedAt) return;
  trendHistory.push({
    generatedAt: data.generatedAt,
    label,
    scanned: data.totalScannedRecords || 0,
    sensitive: data.totalSensitiveRecords || 0,
    highRisk: data.highRiskDatasets?.count || 0,
    remediationActive: data.remediationStatus?.openVsResolved?.active || 0
  });
  while (trendHistory.length > 16) trendHistory.shift();
}

function renderTrends(data) {
  pushTrendPoint(data);
  const labels = trendHistory.map((p) => p.label);
  lineChart("chartTrends", labels, [
    {
      label: "Scanned records",
      data: trendHistory.map((p) => p.scanned),
      borderColor: "#3d8bfd",
      backgroundColor: "rgba(61, 139, 253, 0.15)",
      tension: 0.35,
      fill: true
    },
    {
      label: "Sensitive records",
      data: trendHistory.map((p) => p.sensitive),
      borderColor: "#ff6b6b",
      backgroundColor: "rgba(255, 107, 107, 0.12)",
      tension: 0.35,
      fill: true
    },
    {
      label: "Active remediation",
      data: trendHistory.map((p) => p.remediationActive),
      borderColor: "#ffcc00",
      backgroundColor: "rgba(255, 204, 0, 0.08)",
      tension: 0.35
    }
  ]);
}

function renderHighRiskDatasets(data) {
  const el = document.getElementById("highRiskList");
  if (!el) return;
  const items = data.highRiskDatasets?.topDatasets || [];
  if (items.length === 0) {
    el.innerHTML = `<p class="empty-hint">No high-risk datasets yet.</p>`;
    return;
  }
  el.innerHTML = items
    .slice(0, 8)
    .map((item) => {
      const level = item.riskLevel || item.level || "high";
      return `<div class="list-item">
        <div>
          <strong>${escapeHtml(item.datasetId || item.entityName || "dataset")}</strong>
          <span>${escapeHtml(item.sourceName || item.source || item.reason || "Governance catalog")}</span>
        </div>
        <div class="list-item__meta">
          <span class="${riskPillClass(level)}">${escapeHtml(level)}</span>
          <strong>${fmtNum(item.riskScore ?? item.score)}</strong>
        </div>
      </div>`;
    })
    .join("");
}

function renderComplianceRisks(data) {
  const el = document.getElementById("complianceRiskList");
  if (!el) return;
  const c = data.complianceViolations || {};
  const byReg = c.byRegulation || {};
  const rows = Object.entries(byReg).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  const summary = [
    ["Datasets with violations", c.datasetsWithViolations],
    ["Non-compliant", c.datasetsNonCompliant],
    ["Partially compliant", c.datasetsPartiallyCompliant],
    ["At-risk controls", c.totalAtRiskControls]
  ];
  el.innerHTML = `${summary
    .map(
      ([label, value]) => `<div class="list-item">
        <div><strong>${fmtNum(value)}</strong><span>${escapeHtml(label)}</span></div>
      </div>`
    )
    .join("")}${
    rows.length
      ? `<div class="mini-bars">${rows
          .slice(0, 6)
          .map(([reg, count]) => {
            const max = Math.max(...rows.map(([, n]) => Number(n) || 0), 1);
            return `<div class="mini-bar">
              <span>${escapeHtml(reg)}</span>
              <div><i style="width:${Math.max(6, (Number(count) / max) * 100)}%"></i></div>
              <strong>${fmtNum(count)}</strong>
            </div>`;
          })
          .join("")}</div>`
      : ""
  }`;
}

function renderSourceRiskHeatmap(data) {
  const el = document.getElementById("sourceRiskHeatmap");
  if (!el) return;
  const heatmap = data.sourceRiskHeatmap || {};
  const levels = heatmap.riskLevels || ["low", "medium", "high", "critical"];
  const sources = heatmap.sources || [];
  if (sources.length === 0) {
    el.innerHTML = `<p class="empty-hint">No source risk matrix yet.</p>`;
    return;
  }
  el.innerHTML = `<div class="heatmap__row heatmap__head">
    <span>Source</span>${levels.map((level) => `<span>${escapeHtml(level)}</span>`).join("")}<span>Score</span>
  </div>${sources
    .slice(0, 8)
    .map((source) => {
      const max = Math.max(...levels.map((level) => source.totals?.[level] || 0), 1);
      return `<div class="heatmap__row">
        <span>${escapeHtml(source.sourceName)}</span>
        ${levels
          .map((level) => {
            const value = source.totals?.[level] || 0;
            const alpha = 0.12 + (value / max) * 0.7;
            return `<span class="heatmap__cell heatmap__cell--${escapeHtml(level)}" style="opacity:${alpha}">${fmtNum(value)}</span>`;
          })
          .join("")}
        <span><strong>${fmtNum(source.aggregateRiskScore)}</strong></span>
      </div>`;
    })
    .join("")}`;
}

function renderExposedSystems(data) {
  const el = document.getElementById("exposedSystemsList");
  if (!el) return;
  const systems = data.mostExposedSystems || [];
  if (systems.length === 0) {
    el.innerHTML = `<p class="empty-hint">No exposed systems identified yet.</p>`;
    return;
  }
  el.innerHTML = systems
    .slice(0, 6)
    .map(
      (system) => `<div class="list-item">
        <div>
          <strong>${escapeHtml(system.sourceName || system.systemId)}</strong>
          <span>${escapeHtml((system.reasons || []).join(", ") || "Exposure signals")}</span>
        </div>
        <div class="list-item__meta">
          <span class="${riskPillClass(system.maxRiskLevel)}">${escapeHtml(system.maxRiskLevel)}</span>
          <strong>${fmtNum(system.exposureScore)}</strong>
        </div>
      </div>`
    )
    .join("");
}

function renderPlatformStatus(status) {
  const el = document.getElementById("platformStatus");
  if (!el || !status) return;
  const supa = status.supabase || {};
  const readiness = status.deploymentReadiness || {};
  el.innerHTML = `
    <div class="status-card">
      <span class="status-dot ${supa.configured ? "status-dot--ok" : "status-dot--warn"}"></span>
      <div><strong>Supabase</strong><span>${escapeHtml(supa.message || "Not checked")}</span></div>
    </div>
    <div class="status-card">
      <span class="status-dot ${readiness.productionSecretsConfigured ? "status-dot--ok" : "status-dot--warn"}"></span>
      <div><strong>Auth</strong><span>${escapeHtml(status.app?.auth || "unknown")}</span></div>
    </div>
    <div class="status-card">
      <span class="status-dot status-dot--ok"></span>
      <div><strong>Realtime</strong><span>Dashboard stream endpoint enabled</span></div>
    </div>`;
}

async function loadPlatformStatus() {
  try {
    renderPlatformStatus(await cachedJson("/api/platform/status", 60_000));
  } catch (err) {
    const el = document.getElementById("platformStatus");
    if (el) el.innerHTML = `<div class="status-card"><span class="status-dot status-dot--warn"></span><div><strong>Platform</strong><span>${escapeHtml(err.message)}</span></div></div>`;
  }
}

function renderManagedSources(payload) {
  const tbody = document.querySelector("#managedSourceTable tbody");
  if (!tbody) return;
  const items = payload.items || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-hint">No sources registered yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map((s) => {
      const endpoint = s.connection?.url || s.connection?.host || s.connection?.bucket || s.connection?.fileName || "secret-backed";
      const sync = s.supabaseSync?.enabled ? (s.supabaseSync.ok ? "synced" : "sync failed") : "local";
      return `<tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.type)}</td>
        <td><span class="risk-pill">${escapeHtml(s.status)}</span></td>
        <td>${escapeHtml(endpoint)}</td>
        <td>${escapeHtml(sync)}</td>
      </tr>`;
    })
    .join("");
}

async function loadManagedSources(force = false) {
  try {
    renderManagedSources(await cachedJson("/api/sources", SUPPORT_CACHE_TTL_MS, force));
  } catch (err) {
    const tbody = document.querySelector("#managedSourceTable tbody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-hint">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function addManagedSource(evt) {
  evt.preventDefault();
  const type = document.getElementById("sourceType")?.value || "postgres";
  const endpoint = document.getElementById("sourceEndpoint")?.value.trim() || "";
  const portValue = document.getElementById("sourcePort")?.value.trim() || "";
  const databaseValue = document.getElementById("sourceDatabase")?.value.trim() || "";
  const connection = { authMode: "secret_ref", secretRef: document.getElementById("sourceSecret")?.value.trim() || undefined };
  if (type === "api") connection.url = endpoint;
  else if (type === "s3") {
    connection.bucket = endpoint;
    if (databaseValue) connection.prefix = databaseValue;
  }
  else if (type === "file") connection.fileName = endpoint;
  else {
    connection.host = endpoint;
    if (portValue) connection.port = Number(portValue);
    if (databaseValue) connection.database = databaseValue;
  }
  if (!connection.secretRef) connection.authMode = "none";
  const tags = (document.getElementById("sourceTags")?.value || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  try {
    await apiFetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("sourceName")?.value.trim(),
        type,
        owner: document.getElementById("sourceOwner")?.value.trim() || undefined,
        environment: document.getElementById("sourceEnvironment")?.value || "development",
        connection,
        tags: ["week4", "prototype", ...tags]
      })
    });
    setBanner("ok", "Source added.");
    evt.target.reset();
    invalidateClientCache("/api/sources");
    await loadManagedSources(true);
  } catch (err) {
    setBanner("error", `Source add failed: ${err.message}`);
  }
}

function renderUsers(payload) {
  const tbody = document.querySelector("#userTable tbody");
  if (!tbody) return;
  const items = payload.items || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-hint">No users available or current role cannot manage users.</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map(
      (u) => `<tr>
        <td><strong>${escapeHtml(u.displayName || u.email)}</strong><br><span class="muted small">${escapeHtml(u.email)}</span></td>
        <td>${escapeHtml(String(u.role).replace(/_/g, " "))}</td>
        <td><span class="risk-pill">${u.active === false ? "disabled" : "active"}</span></td>
        <td>${escapeHtml(u.createdAt || "")}</td>
      </tr>`
    )
    .join("");
}

async function loadUsers(force = false) {
  const tbody = document.querySelector("#userTable tbody");
  if (!tbody || !hasPermission("users:manage")) return;
  try {
    renderUsers(await cachedJson("/api/auth/users", SUPPORT_CACHE_TTL_MS, force));
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-hint">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function createUser(evt) {
  evt.preventDefault();
  try {
    await apiFetch("/api/auth/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("userEmail")?.value.trim(),
        displayName: document.getElementById("userDisplayName")?.value.trim(),
        password: document.getElementById("userPassword")?.value || "",
        role: document.getElementById("userRole")?.value || "viewer"
      })
    });
    setBanner("ok", "User created.");
    evt.target.reset();
    invalidateClientCache("/api/auth/users");
    await loadUsers(true);
  } catch (err) {
    setBanner("error", `User creation failed: ${err.message}`);
  }
}

function renderGovernance(data) {
  const c = data.complianceViolations || {};
  const r = data.remediationStatus || {};
  const compliance = document.getElementById("complianceCards");
  if (compliance) {
    compliance.innerHTML = [
      ["Datasets with violations", fmtNum(c.datasetsWithViolations)],
      ["GDPR/DPDP/HIPAA flags", fmtNum(c.totalComplianceFlags)],
      ["Violated controls", fmtNum(c.totalViolatedControls)],
      ["Missing controls", fmtNum(c.totalMissingControls)]
    ]
      .map(([k, v]) => `<div class="stat-card"><div class="stat-card__v">${v}</div><div class="stat-card__k">${k}</div></div>`)
      .join("");
  }
  const remediation = document.getElementById("remediationCards");
  if (remediation) {
    remediation.innerHTML = [
      ["Open", fmtNum(r.openVsResolved?.open)],
      ["In progress", fmtNum(r.openVsResolved?.inProgress)],
      ["Resolved", fmtNum(r.openVsResolved?.resolved)],
      ["Total tickets", fmtNum(r.totalTickets)]
    ]
      .map(([k, v]) => `<div class="stat-card"><div class="stat-card__v">${v}</div><div class="stat-card__k">${k}</div></div>`)
      .join("");
  }
}

async function loadLineageFields() {
  const tbody = document.querySelector("#lineageTable tbody");
  if (!tbody) return;
  try {
    const data = await cachedJson("/api/search/mapped-fields?pageSize=8", SUPPORT_CACHE_TTL_MS);
    if (!data.items?.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-hint">No mapped fields yet. Run discovery and persist to catalog first.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.items
      .map(
        (f) => `<tr>
          <td>${escapeHtml(f.datasetId)}</td>
          <td>${escapeHtml(f.logicalFieldKey)}</td>
          <td>${escapeHtml(f.sensitiveCategory)}</td>
          <td>${escapeHtml(f.jsonPath)}</td>
        </tr>`
      )
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-hint">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function runDiscoveryWorkflow() {
  setBanner("", "");
  try {
    const records = JSON.parse(document.getElementById("recordsInput")?.value || "[]");
    const res = await apiFetch("/api/discovery/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records,
        sourceType: "file",
        sourceName: "dashboard-workbench",
        entityName: "sample-records.json",
        classify: true
      })
    });
    const data = await res.json();
    lastScanPayload = { ...data, records };
    document.getElementById("discoveryOutput").textContent = JSON.stringify(data, null, 2);
    setBanner("ok", "Discovery and classification completed.");
  } catch (err) {
    setBanner("error", `Discovery failed: ${err.message}`);
  }
}

async function runFullWorkflow() {
  setBanner("", "");
  try {
    const records = JSON.parse(document.getElementById("recordsInput")?.value || "[]");
    const res = await apiFetch("/api/workflow/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records,
        sourceType: "file",
        sourceName: "dashboard-workbench",
        entityName: "sample-records.json",
        createRemediation: true,
        reportFormat: "json"
      })
    });
    const data = await res.json();
    lastScanPayload = { discovery: data.discovery, classification: data.classification, records };
    document.getElementById("workflowOutput").textContent = JSON.stringify(data, null, 2);
    document.getElementById("discoveryOutput").textContent = JSON.stringify(
      { discovery: data.discovery, classification: data.classification, risk: data.risk },
      null,
      2
    );
    setBanner("ok", "End-to-end workflow completed.");
    invalidateClientCache();
    lastDashboardSignature = "";
    await loadDashboard();
  } catch (err) {
    setBanner("error", `Workflow failed: ${err.message}`);
  }
}

async function persistLastScan() {
  if (!lastScanPayload?.discovery) {
    setBanner("error", "Run discovery before persisting a catalog snapshot.");
    return;
  }
  try {
    const res = await apiFetch("/api/catalog/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discovery: lastScanPayload.discovery,
        classification: lastScanPayload.classification,
        records: lastScanPayload.records,
        persist: true
      })
    });
    const data = await res.json();
    document.getElementById("discoveryOutput").textContent = JSON.stringify(data, null, 2);
    setBanner("ok", "Catalog snapshot persisted. Dashboard refreshed.");
    invalidateClientCache();
    lastDashboardSignature = "";
    await loadDashboard();
  } catch (err) {
    setBanner("error", `Catalog persist failed: ${err.message}`);
  }
}

async function createRemediationTickets() {
  try {
    const res = await apiFetch("/api/remediation/from-prioritization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minLevel: "medium", limit: 25, skipExistingForDataset: true })
    });
    const data = await res.json();
    setBanner("ok", `Created ${data.created?.length || 0} remediation ticket(s).`);
    invalidateClientCache();
    lastDashboardSignature = "";
    await loadDashboard();
  } catch (err) {
    setBanner("error", `Remediation failed: ${err.message}`);
  }
}

async function runSearch() {
  const params = new URLSearchParams();
  const q = document.getElementById("searchInput")?.value.trim();
  const classification = document.getElementById("searchClassification")?.value || "";
  const risk = document.getElementById("searchRisk")?.value || "";
  const source = document.getElementById("searchSource")?.value.trim() || "";
  const compliance = document.getElementById("searchCompliance")?.value || "";
  const remediationStatus = document.getElementById("searchRemediationStatus")?.value || "";
  const sortBy = document.getElementById("searchSortBy")?.value || "updatedAt";
  const sortOrder = document.getElementById("searchSortOrder")?.value || "desc";
  const pageSize = document.getElementById("searchPageSize")?.value || "10";

  if (q) params.set("q", q);
  if (classification) params.set("classification", classification);
  if (risk) params.set("riskLevel", risk);
  if (source) params.set("sourceName", source);
  if (compliance) {
    params.set("complianceRegulation", compliance);
    params.set("complianceViolation", "true");
  }
  if (remediationStatus) params.set("status", remediationStatus);
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  params.set("page", String(currentSearchPage));
  params.set("pageSize", pageSize);

  setSearchLoading(true);
  try {
    const res = await apiFetch(`/api/search/advanced?${params.toString()}`);
    const data = await res.json();
    renderSearchResults(data);
  } catch (err) {
    renderSearchError(err.message);
  } finally {
    setSearchLoading(false);
  }
}

function setSearchLoading(isLoading) {
  document.getElementById("btnSearch")?.toggleAttribute("disabled", isLoading);
  const summary = document.getElementById("searchSummary");
  if (summary && isLoading) summary.innerHTML = `<span class="loading-dot"></span> Searching...`;
}

function renderSearchError(message) {
  const summary = document.getElementById("searchSummary");
  if (summary) summary.innerHTML = `<span class="search-chip search-chip--error">Search failed</span> ${escapeHtml(message)}`;
  const out = document.getElementById("searchOutput");
  if (out) out.textContent = message;
}

function renderSearchResults(data) {
  const datasets = data.datasets || { items: [], total: 0, page: 1, pageSize: 10, hasMore: false };
  const remediation = data.remediation || { items: [], total: 0 };
  lastSearchHasMore = Boolean(datasets.hasMore);
  const summary = document.getElementById("searchSummary");
  if (summary) {
    const global = data.global;
    summary.innerHTML = `
      <span class="search-chip">${fmtNum(datasets.total)} datasets</span>
      <span class="search-chip">${fmtNum(remediation.total)} remediation</span>
      ${global ? `<span class="search-chip">${fmtNum(global.fields?.total || 0)} fields</span><span class="search-chip">${fmtNum(global.sources?.total || 0)} sources</span>` : ""}
      <span class="muted small">Sorted by ${escapeHtml(data.query?.sortBy || "updatedAt")} ${escapeHtml(data.query?.sortOrder || "desc")}</span>`;
  }

  renderDatasetSearchRows(datasets.items || []);
  renderRemediationSearchRows(remediation.items || []);

  const pageLabel = document.getElementById("searchPageLabel");
  if (pageLabel) pageLabel.textContent = `Page ${datasets.page || currentSearchPage} of ${Math.max(1, Math.ceil((datasets.total || 0) / Math.max(1, datasets.pageSize || 10)))}`;
  document.getElementById("btnSearchPrev")?.toggleAttribute("disabled", currentSearchPage <= 1);
  document.getElementById("btnSearchNext")?.toggleAttribute("disabled", !lastSearchHasMore);
  const out = document.getElementById("searchOutput");
  if (out) out.textContent = JSON.stringify(data.query || {}, null, 2);
}

function renderDatasetSearchRows(items) {
  const tbody = document.querySelector("#searchDatasetTable tbody");
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-hint">No datasets match these filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map((item) => {
      const labels = Object.keys(item.classificationTotals || {}).filter((k) => (item.classificationTotals[k] || 0) > 0);
      const compliance = item.risk?.analysis?.complianceIntelligence?.status || "not_applicable";
      return `<tr>
        <td><strong>${escapeHtml(item.trace?.entityName || item.datasetId)}</strong><br><span class="muted small">${escapeHtml(item.datasetId)}</span></td>
        <td>${escapeHtml(item.trace?.sourceType || "source")} / ${escapeHtml(item.trace?.sourceName || "unknown")}</td>
        <td>${escapeHtml(labels.slice(0, 3).join(", ") || "Unclassified")}</td>
        <td><span class="${riskPillClass(item.riskLevel)}">${escapeHtml(item.riskLevel)}</span><br><span class="muted small">${fmtNum(item.risk?.score)} score</span></td>
        <td>${escapeHtml(String(compliance).replace(/_/g, " "))}</td>
        <td>${fmtNum(item.totalRecords)} total<br><span class="muted small">${fmtNum(item.sensitiveRecordCount)} sensitive</span></td>
      </tr>`;
    })
    .join("");
}

function renderRemediationSearchRows(items) {
  const tbody = document.querySelector("#searchRemediationTable tbody");
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-hint">No remediation tickets match these filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map(
      (ticket) => `<tr>
        <td><strong>${escapeHtml(ticket.id)}</strong><br><span class="muted small">${escapeHtml(ticket.riskType)}</span></td>
        <td>${escapeHtml(ticket.datasetId || ticket.source || "n/a")}</td>
        <td>${escapeHtml(String(ticket.status).replace(/_/g, " "))}</td>
        <td><span class="${riskPillClass(ticket.severity)}">${escapeHtml(ticket.severity)}</span></td>
        <td>${escapeHtml(ticket.suggestedAction).slice(0, 140)}</td>
      </tr>`
    )
    .join("");
}

async function generateReport() {
  try {
    const res = await apiFetch("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportType: document.getElementById("reportType")?.value || "executive_summary",
        format: document.getElementById("reportFormat")?.value || "json",
        tags: ["week4", "dashboard"]
      })
    });
    const data = await res.json();
    document.getElementById("reportOutput").textContent = JSON.stringify(data, null, 2);
    if (data.async) {
      const el = document.getElementById("reportDownload");
      if (el) el.innerHTML = `<span class="search-chip">Queued</span><span class="muted small">${escapeHtml(data.message || "Report generation queued")}</span>`;
      return;
    }
    downloadGeneratedReport(data);
    invalidateClientCache("/api/reports");
    await loadReportHistory();
  } catch (err) {
    document.getElementById("reportOutput").textContent = err.message;
  }
}

function base64ToBlob(base64, contentType) {
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

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadGeneratedReport(data) {
  const report = data.report || {};
  const download = report.download;
  if (!download) return;
  const blob =
    download.encoding === "base64"
      ? base64ToBlob(download.data, download.contentType)
      : new Blob([download.data], { type: download.contentType });
  triggerDownload(blob, download.fileName);
  const el = document.getElementById("reportDownload");
  if (el) {
    el.innerHTML = `<span class="search-chip">Downloaded</span>
      <span class="muted small">${escapeHtml(download.fileName)} generated at ${escapeHtml(report.generatedAt || "")}</span>
      <button type="button" class="btn btn--ghost" data-report-id="${escapeHtml(report.id)}" data-format="${escapeHtml(download.format)}">Download again</button>`;
    el.querySelector("button")?.addEventListener("click", () => {
      void downloadStoredReport(report.id, download.format);
    });
  }
}

async function downloadStoredReport(id, format) {
  try {
    const res = await apiFetch(`/api/reports/${encodeURIComponent(id)}/download?format=${encodeURIComponent(format)}`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    triggerDownload(blob, match?.[1] || `proteccio-report.${format}`);
  } catch (err) {
    setBanner("error", `Download failed: ${err.message}`);
  }
}

async function loadReportHistory() {
  const tbody = document.querySelector("#reportHistoryTable tbody");
  if (!tbody) return;
  try {
    const data = await cachedJson("/api/reports?pageSize=10", SUPPORT_CACHE_TTL_MS);
    if (!data.items?.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-hint">No reports generated yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.items
      .map(
        (r) => `<tr>
          <td><strong>${escapeHtml(r.title)}</strong><br><span class="muted small">${escapeHtml(r.summary)}</span></td>
          <td>${escapeHtml(String(r.reportType).replace(/_/g, " "))}</td>
          <td>${escapeHtml(r.generatedAt)}</td>
          <td>${escapeHtml(r.primaryFormat)}</td>
          <td>
            <button type="button" class="btn btn--ghost report-download" data-id="${escapeHtml(r.id)}" data-format="json">JSON</button>
            <button type="button" class="btn btn--ghost report-download" data-id="${escapeHtml(r.id)}" data-format="csv">CSV</button>
            <button type="button" class="btn btn--ghost report-download" data-id="${escapeHtml(r.id)}" data-format="pdf">PDF</button>
          </td>
        </tr>`
      )
      .join("");
    tbody.querySelectorAll(".report-download").forEach((btn) => {
      btn.addEventListener("click", () => {
        void downloadStoredReport(btn.getAttribute("data-id"), btn.getAttribute("data-format"));
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-hint">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function startRealtimeDashboard() {
  if (realtimeController) {
    realtimeController.abort();
    realtimeController = null;
    document.getElementById("btnRealtime").textContent = "Start live";
    setDashboardState("ok", "Live updates stopped");
    setBanner("ok", "Live dashboard stopped.");
    return;
  }

  realtimeController = new AbortController();
  document.getElementById("btnRealtime").textContent = "Stop live";
  setDashboardState("live", "Connecting to live dashboard stream...");
  try {
    const res = await fetch("/api/realtime/dashboard", {
      headers: authHeaders(),
      signal: realtimeController.signal
    });
    if (!res.ok || !res.body) {
      throw new Error(`Stream failed (${res.status})`);
    }
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
        if (!line) continue;
        const data = JSON.parse(line.slice(6));
        renderDashboardPayload(data, "Live dashboard updated.");
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      setDashboardState("error", `Live update error: ${err.message}`);
      setBanner("error", `Realtime failed: ${err.message}`);
    }
  } finally {
    realtimeController = null;
    document.getElementById("btnRealtime").textContent = "Start live";
  }
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

function dashboardSignature(data) {
  return JSON.stringify({
    scanned: data.totalScannedRecords,
    sensitive: data.totalSensitiveRecords,
    highRisk: data.highRiskDatasets?.count,
    compliance: data.complianceViolations,
    risk: data.riskDistribution,
    classification: data.classificationDistribution,
    discovery: data.discoveryStatistics,
    profiling: data.profilingStatistics,
    mapping: data.mappingRelationships,
    remediation: data.remediationStatus,
    sources: data.sourceWiseBreakdown,
    exposed: data.mostExposedSystems
  });
}

async function loadDashboard() {
  setBanner("", "");
  setDashboardLoading(true);

  let res;
  try {
    res = await fetch("/api/dashboard/analytics", { headers: authHeaders() });
  } catch (e) {
    setDashboardLoading(false);
    setDashboardState("error", `Network error: ${e && e.message ? e.message : "failed to fetch"}`);
    setBanner("error", `Network error: ${e && e.message ? e.message : "failed to fetch"}`);
    return;
  }

  if (res.status === 401) {
    setDashboardLoading(false);
    setDashboardState("error", "Unauthorized. Login or provide an API key.");
    setBanner(
      "error",
      "Unauthorized (401). Login with superadmin@discover.app / SuperAdmin1! or paste a valid API key, then click Refresh."
    );
    return;
  }

  if (!res.ok) {
    const t = await res.text();
    setDashboardLoading(false);
    setDashboardState("error", `Dashboard request failed (${res.status})`);
    setBanner("error", `Request failed (${res.status}): ${t.slice(0, 200)}`);
    return;
  }

  const data = await res.json();
  renderDashboardPayload(data, "Loaded latest aggregates.");
  try {
    await Promise.all([loadPlatformStatus(), loadManagedSources(), loadLineageFields()]);
  } finally {
    setDashboardLoading(false);
  }
}

function renderDashboardPayload(data, message) {
  if (message) setBanner("ok", message);
  setDashboardState(realtimeController ? "live" : "ok", realtimeController ? "Live dashboard updated" : "Dashboard data loaded");
  const signature = dashboardSignature(data);
  if (signature === lastDashboardSignature) return;
  lastDashboardSignature = signature;
  const gen = document.getElementById("generatedAt");
  if (gen) gen.textContent = data.generatedAt ? `Generated at ${data.generatedAt}` : "";

  renderKpis(data);
  renderTrends(data);
  renderHighRiskDatasets(data);
  renderComplianceRisks(data);

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
  renderGovernance(data);
}

function init() {
  const saved = sessionStorage.getItem(API_KEY_STORAGE_KEY);
  const input = document.getElementById("apiKey");
  if (input && saved) input.value = saved;
  setLoginState(sessionStorage.getItem(USER_STORAGE_KEY) || "superadmin@discover.app");
  const pass = document.getElementById("loginPassword");
  if (pass && !pass.value) pass.value = "SuperAdmin1!";
  initNavigationState();

  document.getElementById("btnLogin")?.addEventListener("click", () => {
    void login();
  });
  document.getElementById("btnLogout")?.addEventListener("click", () => {
    void logout();
  });
  document.getElementById("btnRefresh")?.addEventListener("click", () => loadDashboard());
  document.getElementById("btnRealtime")?.addEventListener("click", () => {
    void startRealtimeDashboard();
  });
  document.getElementById("btnSaveKey")?.addEventListener("click", () => {
    const v = document.getElementById("apiKey")?.value.trim() || "";
    if (v) sessionStorage.setItem(API_KEY_STORAGE_KEY, v);
    else sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    setBanner("ok", v ? "API key saved in this browser session." : "Cleared saved API key.");
  });
  document.getElementById("signupForm")?.addEventListener("submit", (evt) => {
    void signup(evt);
  });
  document.getElementById("btnForgotPassword")?.addEventListener("click", () => {
    void forgotPassword();
  });
  document.getElementById("sourceForm")?.addEventListener("submit", (evt) => {
    void addManagedSource(evt);
  });
  document.getElementById("userForm")?.addEventListener("submit", (evt) => {
    void createUser(evt);
  });
  document.getElementById("btnRefreshUsers")?.addEventListener("click", () => {
    invalidateClientCache("/api/auth/users");
    void loadUsers(true);
  });
  document.getElementById("btnRunDiscovery")?.addEventListener("click", () => {
    void runDiscoveryWorkflow();
  });
  document.getElementById("btnRunWorkflow")?.addEventListener("click", () => {
    void runFullWorkflow();
  });
  document.getElementById("btnPersistCatalog")?.addEventListener("click", () => {
    void persistLastScan();
  });
  document.getElementById("btnCreateRemediation")?.addEventListener("click", () => {
    void createRemediationTickets();
  });
  document.getElementById("advancedSearchForm")?.addEventListener("submit", (evt) => {
    evt.preventDefault();
    currentSearchPage = 1;
    void runSearch();
  });
  document.getElementById("btnSearchPrev")?.addEventListener("click", () => {
    if (currentSearchPage > 1) {
      currentSearchPage -= 1;
      void runSearch();
    }
  });
  document.getElementById("btnSearchNext")?.addEventListener("click", () => {
    if (lastSearchHasMore) {
      currentSearchPage += 1;
      void runSearch();
    }
  });
  document.getElementById("btnGenerateReport")?.addEventListener("click", () => {
    void generateReport();
  });
  document.getElementById("btnRefreshReports")?.addEventListener("click", () => {
    invalidateClientCache("/api/reports");
    void loadReportHistory();
  });

  void loadCurrentUser();
  void loadUsers();
  void loadReportHistory();
  loadDashboard();
}

document.addEventListener("DOMContentLoaded", init);
