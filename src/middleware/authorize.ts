import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { roleHasPermission } from "../auth/permissions";
import { AUTH_PUBLIC_PATHS, normalizeApiPath, resolveRequiredPermission } from "../auth/route-policy";
import type { Permission } from "../auth/types";

/**
 * Enforces route-level permissions when RBAC is enabled.
 */
export function authorize(req: Request, res: Response, next: NextFunction): void {
  if (!env.RBAC_ENABLED) {
    next();
    return;
  }

  const apiPath = normalizeApiPath(req.originalUrl);
  if (!apiPath.startsWith("/api") || AUTH_PUBLIC_PATHS.has(apiPath)) {
    next();
    return;
  }

  const principal = req.user;
  if (!principal) {
    res.status(401).json({ error: "Unauthorized", message: "Authentication required" });
    return;
  }

  const permission = resolveRequiredPermission(req.method, apiPath);
  if (permission === undefined) {
    res.status(403).json({
      error: "Forbidden",
      message: "Route is not available for this role"
    });
    return;
  }

  if (!roleHasPermission(principal.role, permission)) {
    res.status(403).json({
      error: "Forbidden",
      message: "Insufficient permissions"
    });
    return;
  }

  next();
}

/** Per-route guard for explicit permission checks in routers. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!env.RBAC_ENABLED) {
      next();
      return;
    }

    const principal = req.user;
    if (!principal) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const allowed = permissions.some((p) => roleHasPermission(principal.role, p));
    if (!allowed) {
      res.status(403).json({
        error: "Forbidden",
        message: `Insufficient permissions`,
        requiredPermissions: permissions
      });
      return;
    }

    next();
  };
}
