import path from "node:path";
import { readFileSync } from "node:fs";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { apiRateLimiter } from "./middleware/rate-limit";
import ingestionRoutes from "./routes/ingestion.routes";
import discoveryRoutes from "./routes/discovery.routes";
import classificationRoutes from "./routes/classification.routes";
import mappingRoutes from "./routes/mapping.routes";
import profilingRoutes from "./routes/profiling.routes";
import riskRoutes from "./routes/risk.routes";
import remediationRoutes from "./routes/remediation.routes";
import searchRoutes from "./routes/search.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import auditRoutes from "./routes/audit.routes";
import reportingRoutes from "./routes/reporting.routes";
import alertingRoutes from "./routes/alerting.routes";
import { logger } from "./utils/logger";
import { enforceHttps } from "./middleware/https";
import { authenticate, legacyApiKeyGate } from "./middleware/authenticate";
import { authorize } from "./middleware/authorize";
import authRoutes from "./routes/auth.routes";

const openApiPath = path.join(process.cwd(), "openapi", "openapi.json");
let openApiSpec: Record<string, unknown>;
try {
  openApiSpec = JSON.parse(readFileSync(openApiPath, "utf8")) as Record<string, unknown>;
} catch {
  openApiSpec = {
    openapi: "3.0.3",
    info: { title: "API (openapi/openapi.json missing)", version: "0" },
    paths: {}
  };
}

const app = express();
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(pinoHttp({ logger }));
app.use("/api", apiRateLimiter);

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (req.path === "/openapi.json") return next();
  if (req.path === "/docs" || req.path.startsWith("/docs/")) return next();
  enforceHttps(req, res, next);
});

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (req.path === "/openapi.json") return next();
  if (req.path === "/docs" || req.path.startsWith("/docs/")) return next();
  if (req.path === "/dashboard" || req.path.startsWith("/dashboard/")) return next();
  if (req.method === "GET" && req.path === "/") return next();
  legacyApiKeyGate(req, res, next);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: "Data Ingestion API",
    customCss: ".swagger-ui .topbar { display: none }",
    swaggerOptions: { persistAuthorization: env.NODE_ENV !== "production" }
  })
);

app.get("/", (_req, res) => {
  res.redirect(302, "/dashboard/");
});

app.use(
  "/dashboard",
  express.static(path.join(process.cwd(), "public", "dashboard"), {
    index: "index.html",
    fallthrough: false
  })
);

app.use("/api", authenticate);
app.use("/api", authorize);

app.use("/api", authRoutes);
app.use("/api", ingestionRoutes);
app.use("/api", discoveryRoutes);
app.use("/api", classificationRoutes);
app.use("/api", mappingRoutes);
app.use("/api", profilingRoutes);
app.use("/api", riskRoutes);
app.use("/api", remediationRoutes);
app.use("/api", searchRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", auditRoutes);
app.use("/api", reportingRoutes);
app.use("/api", alertingRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const message =
    env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Unknown error";
  res.status(500).json({ error: message });
});

export default app;
