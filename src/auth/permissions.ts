import type { Permission, Role } from "./types";

export const ALL_PERMISSIONS: readonly Permission[] = [
  "ingestion:read",
  "ingestion:write",
  "discovery:read",
  "discovery:write",
  "classification:write",
  "mapping:read",
  "mapping:write",
  "profiling:read",
  "profiling:write",
  "catalog:read",
  "catalog:write",
  "risk:read",
  "risk:write",
  "remediation:read",
  "remediation:write",
  "search:read",
  "dashboard:read",
  "audit:read",
  "reporting:read",
  "reporting:write",
  "alerts:read",
  "alerts:write",
  "users:manage",
  "workflow:execute"
] as const;

const READ_ONLY: Permission[] = [
  "ingestion:read",
  "discovery:read",
  "mapping:read",
  "profiling:read",
  "catalog:read",
  "risk:read",
  "remediation:read",
  "search:read",
  "dashboard:read",
  "audit:read",
  "reporting:read",
  "alerts:read"
];

/** Role → granted permissions. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  privacy_admin: [
    "discovery:read",
    "mapping:read",
    "profiling:read",
    "catalog:read",
    "catalog:write",
    "risk:read",
    "risk:write",
    "remediation:read",
    "remediation:write",
    "search:read",
    "dashboard:read",
    "audit:read",
    "reporting:read",
    "reporting:write",
    "alerts:read",
    "alerts:write",
    "workflow:execute"
  ],
  security_analyst: [
    "ingestion:read",
    "ingestion:write",
    "discovery:read",
    "discovery:write",
    "classification:write",
    "mapping:read",
    "mapping:write",
    "profiling:read",
    "profiling:write",
    "catalog:read",
    "risk:read",
    "risk:write",
    "remediation:read",
    "search:read",
    "dashboard:read",
    "audit:read",
    "reporting:read",
    "alerts:read",
    "workflow:execute"
  ],
  auditor: [
    ...READ_ONLY,
    "reporting:write"
  ],
  viewer: READ_ONLY,
  service: [
    "ingestion:read",
    "ingestion:write",
    "discovery:read",
    "discovery:write",
    "classification:write",
    "mapping:read",
    "mapping:write",
    "profiling:read",
    "profiling:write",
    "catalog:read",
    "catalog:write",
    "risk:read",
    "risk:write",
    "remediation:read",
    "remediation:write",
    "search:read",
    "dashboard:read",
    "audit:read",
    "reporting:read",
    "reporting:write",
    "alerts:read",
    "alerts:write",
    "workflow:execute"
  ]
};

const permissionCache = new Map<Role, Set<Permission>>();

export function permissionsForRole(role: Role): Set<Permission> {
  let cached = permissionCache.get(role);
  if (!cached) {
    cached = new Set(ROLE_PERMISSIONS[role]);
    permissionCache.set(role, cached);
  }
  return cached;
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).has(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  privacy_admin: "Privacy Admin",
  security_analyst: "Security Analyst",
  auditor: "Auditor",
  viewer: "Viewer",
  service: "Service Account"
};
