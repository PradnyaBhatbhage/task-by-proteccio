import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

/**
 * When `ENFORCE_HTTPS=true`, rejects requests that appear to be plain HTTP
 * behind a reverse proxy (`X-Forwarded-Proto: http`). Prefer TLS termination at the edge.
 */
export function enforceHttps(req: Request, res: Response, next: NextFunction): void {
  if (!env.ENFORCE_HTTPS) {
    next();
    return;
  }

  const xfProto = String(req.headers["x-forwarded-proto"] ?? "").toLowerCase();
  if (xfProto && xfProto !== "https") {
    res.status(403).json({ error: "HTTPS is required for this service." });
    return;
  }

  next();
}
