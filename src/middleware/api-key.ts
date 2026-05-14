import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

/**
 * When `API_KEY` is set, requires `Authorization: Bearer <key>` or `X-API-Key: <key>`.
 * If unset, authentication is disabled (development convenience).
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const configured = env.API_KEY?.trim();
  if (!configured) {
    next();
    return;
  }

  const bearer = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
  const bearerToken = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
  const headerKey = typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"].trim() : "";

  if (bearerToken === configured || headerKey === configured) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
