import path from "node:path";
import { readFileSync } from "node:fs";
import express from "express";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import ingestionRoutes from "./routes/ingestion.routes";
import discoveryRoutes from "./routes/discovery.routes";
import classificationRoutes from "./routes/classification.routes";
import mappingRoutes from "./routes/mapping.routes";
import profilingRoutes from "./routes/profiling.routes";
import searchRoutes from "./routes/search.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import auditRoutes from "./routes/audit.routes";
import { logger } from "./utils/logger";
import { enforceHttps } from "./middleware/https";
import { apiKeyAuth } from "./middleware/api-key";

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
app.use(express.json({ limit: "5mb" }));
app.use(pinoHttp({ logger }));

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
  apiKeyAuth(req, res, next);
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
    swaggerOptions: { persistAuthorization: true }
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

app.use("/api", ingestionRoutes);
app.use("/api", discoveryRoutes);
app.use("/api", classificationRoutes);
app.use("/api", mappingRoutes);
app.use("/api", profilingRoutes);
app.use("/api", searchRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", auditRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: message });
});

export default app;
