import type { AuthSession } from "./api";

export type Permission =
  | "dashboard:read"
  | "ingestion:read"
  | "ingestion:write"
  | "workflow:execute"
  | "mapping:read"
  | "remediation:write"
  | "search:read"
  | "reporting:read"
  | "reporting:write"
  | "users:manage";

export type NavItem = {
  href: string;
  label: string;
  permission?: Permission;
};

export const PUBLIC_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", permission: "dashboard:read" },
  { href: "/sources", label: "Sources", permission: "ingestion:read" },
  { href: "/discovery", label: "Discovery", permission: "workflow:execute" },
  { href: "/mapping", label: "Mapping", permission: "mapping:read" },
  { href: "/compliance", label: "Compliance", permission: "dashboard:read" },
  { href: "/governance", label: "Governance", permission: "dashboard:read" },
  { href: "/search", label: "Search", permission: "search:read" },
  { href: "/reports", label: "Reports", permission: "reporting:read" },
  { href: "/users", label: "Users", permission: "users:manage" }
];

export function requiredPermissionForPath(pathname: string): Permission | undefined {
  const match = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.permission;
}

export function hasPermission(session: AuthSession | null, permission?: Permission): boolean {
  if (!permission) return true;
  return Boolean(session?.permissions?.includes(permission));
}

export function visibleNavItems(session: AuthSession | null): NavItem[] {
  return NAV_ITEMS.filter((item) => hasPermission(session, item.permission));
}
