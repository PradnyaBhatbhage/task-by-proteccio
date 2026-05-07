import express from "express";
import pinoHttp from "pino-http";
import ingestionRoutes from "./routes/ingestion.routes";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { startScheduler } from "./services/ingestion.service";
import { PostgresConnector } from "./connectors/postgres.connector";
import { normalizeRecords } from "./services/normalizer";
import { buildMetadata } from "./services/metadata";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(pinoHttp({ logger }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", ingestionRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: message });
});

startScheduler(async () => {
  try {
    if (!env.POSTGRES_USER || !env.POSTGRES_PASSWORD || !env.POSTGRES_DB) {
      logger.info("Scheduled ingestion skipped (missing Postgres creds).");
      return;
    }

    const connector = new PostgresConnector();
    const ok = await connector.validateConnection();
    if (!ok) {
      logger.warn("Scheduled ingestion: Postgres connection validation failed.");
      return;
    }

    const tables = await connector.listTables();
    if (tables.length === 0) {
      logger.info("Scheduled ingestion: no Postgres tables found.");
      return;
    }

    const tableName = tables[0];
    const sample = await connector.fetchSample(tableName, 10);
    const normalized = normalizeRecords(sample);

    const metadata = buildMetadata({
      sourceName: tableName,
      sourceType: "database",
      entityName: tableName,
      recordCount: normalized.length,
      createdDate: new Date()
    });

    logger.info({ tableName, recordCount: normalized.length, metadata }, "Scheduled ingestion ran successfully");
  } catch (err) {
    logger.error({ err }, "Scheduled ingestion failed");
  }
});

app.listen(Number(env.PORT), () => {
  logger.info(`Ingestion service listening on port ${env.PORT}`);
});
