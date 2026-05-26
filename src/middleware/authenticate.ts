import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { looksLikeJwt, verifyAccessToken } from "../auth/jwt";
import type { AuthPrincipal, Role } from "../auth/types";
import { AUTH_PUBLIC_PATHS, normalizeApiPath } from "../auth/route-policy";
import { secureCompareSecret } from "../utils/security";

function parseBearer(req: Request): string {
  const raw = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

function parseApiKeyHeader(req: Request): string {
  return typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"].trim() : "";
}

function servicePrincipal(): AuthPrincipal {
  return {
    id: "service:api-key",
    email: "service@internal",
    displayName: "API Key Service",
    role: env.API_KEY_ROLE,
    authMethod: "api_key"
  };
}

function attachUser(req: Request, principal: AuthPrincipal): void {
  req.user = principal;
}

/**
 * When RBAC is enabled (`JWT_SECRET` set), authenticates JWT or legacy API key.
 * Public: `/api/auth/login` only under `/api`.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (!env.RBAC_ENABLED) {
    next();
    return;
  }

  const apiPath = normalizeApiPath(req.originalUrl);
  if (!apiPath.startsWith("/api")) {
    next();
    return;
  }

  if (AUTH_PUBLIC_PATHS.has(apiPath)) {
    next();
    return;
  }

  const bearer = parseBearer(req);
  const headerKey = parseApiKeyHeader(req);
  const configuredKey = env.API_KEY?.trim();

  if (bearer && looksLikeJwt(bearer)) {
    const principal = verifyAccessToken(bearer);
    if (!principal) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token" });
      return;
    }
    attachUser(req, principal);
    next();
    return;
  }

  if (
    configuredKey &&
    (secureCompareSecret(bearer, configuredKey) || secureCompareSecret(headerKey, configuredKey))
  ) {
    attachUser(req, servicePrincipal());
    next();
    return;
  }

  if (bearer && !looksLikeJwt(bearer)) {
    const principal = verifyAccessToken(bearer);
    if (principal) {
      attachUser(req, principal);
      next();
      return;
    }
  }

  res.status(401).json({
    error: "Unauthorized",
    message: "Valid JWT (Authorization: Bearer) or API key required"
  });
}

/** Legacy global API key gate when RBAC is off. */
export function legacyApiKeyGate(req: Request, res: Response, next: NextFunction): void {
  if (env.RBAC_ENABLED) {
    next();
    return;
  }

  const configured = env.API_KEY?.trim();
  if (!configured) {
    next();
    return;
  }

  const bearer = parseBearer(req);
  const headerKey = parseApiKeyHeader(req);
  if (secureCompareSecret(bearer, configured) || secureCompareSecret(headerKey, configured)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}

export function getActorId(req: Request): string | undefined {
  return req.user?.email ?? req.user?.id;
}

export function getActorRole(req: Request): Role | undefined {
  return req.user?.role;
}
