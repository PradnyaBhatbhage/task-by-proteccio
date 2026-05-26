import app from "./app";
import { bootstrapAuth } from "./auth/bootstrap";
import { assertSecurityConfiguration } from "./config/security";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { startScheduler } from "./services/ingestion.service";
import { startAlertScheduler, startAlertWorker } from "./alerting";
import { startReportWorker } from "./reporting";
import { PostgresConnector } from "./connectors/postgres.connector";
import { normalizeRecords } from "./services/normalizer";
import { buildMetadata } from "./services/metadata";

const runningOnVercel = Boolean(process.env.VERCEL);

assertSecurityConfiguration();

if (!runningOnVercel) {
  startAlertWorker();
  startAlertScheduler();
  startReportWorker();

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

      logger.info(
        { tableName, recordCount: normalized.length, metadataKeys: Object.keys(metadata) },
        "Scheduled ingestion ran successfully"
      );
    } catch (err) {
      logger.error({ err }, "Scheduled ingestion failed");
    }
  });

  void bootstrapAuth().then(() => {
    app.listen(Number(env.PORT), () => {
      logger.info(`Ingestion service listening on port ${env.PORT}`);
      logger.info(`Dashboard UI: http://localhost:${env.PORT}/dashboard/`);
      if (env.RBAC_ENABLED) {
        logger.info("RBAC enabled (JWT). POST /api/auth/login to obtain a token.");
      }
    });
  });
}

/** CommonJS default so hosts that `require()` this file get the Express app directly (e.g. Vercel). */
export = app;
