import type { Permission } from "./types";

export interface RouteRule {
  methods: readonly string[];
  pattern: RegExp;
  permission: Permission;
}

/**
 * Maps HTTP method + `/api/...` path to a required permission.
 * First matching rule wins.
 */
export const ROUTE_RULES: RouteRule[] = [
  // Auth (login is public; user admin requires users:manage)
  { methods: ["POST"], pattern: /^\/api\/auth\/login$/, permission: "dashboard:read" },
  { methods: ["GET"], pattern: /^\/api\/auth\/me$/, permission: "dashboard:read" },
  { methods: ["GET"], pattern: /^\/api\/auth\/roles$/, permission: "dashboard:read" },
  { methods: ["POST"], pattern: /^\/api\/auth\/users$/, permission: "users:manage" },
  { methods: ["GET"], pattern: /^\/api\/auth\/users$/, permission: "users:manage" },
  { methods: ["PATCH"], pattern: /^\/api\/auth\/users\/[^/]+$/, permission: "users:manage" },

  // Ingestion
  { methods: ["GET"], pattern: /^\/api\/(db|s3|history)/, permission: "ingestion:read" },
  { methods: ["POST"], pattern: /^\/api\/(upload|ingest)/, permission: "ingestion:write" },

  // Discovery & classification
  { methods: ["GET"], pattern: /^\/api\/discovery/, permission: "discovery:read" },
  { methods: ["POST"], pattern: /^\/api\/discovery/, permission: "discovery:write" },
  { methods: ["POST"], pattern: /^\/api\/classification/, permission: "classification:write" },

  // Mapping
  { methods: ["GET"], pattern: /^\/api\/mapping/, permission: "mapping:read" },
  { methods: ["POST"], pattern: /^\/api\/mapping/, permission: "mapping:write" },

  // Profiling & catalog
  { methods: ["POST"], pattern: /^\/api\/profiling/, permission: "profiling:write" },
  { methods: ["POST"], pattern: /^\/api\/catalog/, permission: "catalog:write" },
  { methods: ["GET"], pattern: /^\/api\/catalog/, permission: "catalog:read" },

  // Risk
  { methods: ["GET"], pattern: /^\/api\/risk/, permission: "risk:read" },
  { methods: ["POST"], pattern: /^\/api\/risk/, permission: "risk:write" },

  // Remediation
  { methods: ["GET"], pattern: /^\/api\/remediation/, permission: "remediation:read" },
  { methods: ["POST", "PATCH"], pattern: /^\/api\/remediation/, permission: "remediation:write" },

  // Search & dashboard
  { methods: ["GET"], pattern: /^\/api\/search/, permission: "search:read" },
  { methods: ["GET"], pattern: /^\/api\/dashboard/, permission: "dashboard:read" },

  // Audit & reporting
  { methods: ["GET"], pattern: /^\/api\/audit/, permission: "audit:read" },
  { methods: ["GET"], pattern: /^\/api\/reports/, permission: "reporting:read" },
  { methods: ["POST"], pattern: /^\/api\/reports/, permission: "reporting:write" },

  // Alerts & notifications
  { methods: ["GET"], pattern: /^\/api\/alerts/, permission: "alerts:read" },
  { methods: ["POST", "PATCH"], pattern: /^\/api\/alerts/, permission: "alerts:write" }
];

/** Paths that skip RBAC permission checks (still require auth when RBAC is on). */
export const AUTH_PUBLIC_PATHS = new Set(["/api/auth/login"]);

export function resolveRequiredPermission(method: string, apiPath: string): Permission | undefined {
  const upper = method.toUpperCase();
  for (const rule of ROUTE_RULES) {
    if (!rule.methods.includes(upper)) continue;
    if (rule.pattern.test(apiPath)) return rule.permission;
  }

  return undefined;
}

export function normalizeApiPath(originalUrl: string): string {
  const pathOnly = originalUrl.split("?")[0] ?? originalUrl;
  if (pathOnly.startsWith("/api")) return pathOnly;
  return `/api${pathOnly}`;
}
