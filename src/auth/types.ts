/** Platform roles for RBAC. */
export type Role =
  | "super_admin"
  | "privacy_admin"
  | "security_analyst"
  | "auditor"
  | "viewer"
  | "service";

export const ROLES: readonly Role[] = [
  "super_admin",
  "privacy_admin",
  "security_analyst",
  "auditor",
  "viewer",
  "service"
] as const;

export type Permission =
  | "ingestion:read"
  | "ingestion:write"
  | "discovery:read"
  | "discovery:write"
  | "classification:write"
  | "mapping:read"
  | "mapping:write"
  | "profiling:read"
  | "profiling:write"
  | "catalog:read"
  | "catalog:write"
  | "risk:read"
  | "risk:write"
  | "remediation:read"
  | "remediation:write"
  | "search:read"
  | "dashboard:read"
  | "audit:read"
  | "reporting:read"
  | "reporting:write"
  | "alerts:read"
  | "alerts:write"
  | "users:manage"
  | "workflow:execute";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

/** Attached to Express `req.user` after authentication. */
export interface AuthPrincipal {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  authMethod: "jwt" | "api_key" | "supabase";
}

export interface JwtClaims {
  sub: string;
  email: string;
  displayName?: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
