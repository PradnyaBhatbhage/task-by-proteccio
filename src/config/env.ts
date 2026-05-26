import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const emptyToUndefined = (v: unknown): unknown => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
};

const EnvSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.string().default("development"),

  /** When set, protects mutating/analytics routes via `apiKeyAuth` (see middleware). */
  API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),

  /** Enables JWT RBAC when set; login and role-based route guards apply under `/api/*`. */
  JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  JWT_EXPIRES_IN: z.string().default("8h"),
  JWT_ISSUER: z.string().default("proteccio-governance"),
  /** Role assigned to valid `API_KEY` requests when RBAC is enabled. */
  API_KEY_ROLE: z
    .enum(["super_admin", "privacy_admin", "security_analyst", "auditor", "viewer", "service"])
    .default("security_analyst"),
  /** Seed built-in demo users on startup (change passwords in production). */
  SEED_DEFAULT_USERS: z
    .preprocess((v) => v === true || v === "true" || v === "1" || v === 1, z.boolean())
    .optional()
    .default(true),
  /** When true, requires `X-Forwarded-Proto: https` (typical behind TLS-terminating proxy). */
  ENFORCE_HTTPS: z
    .preprocess((v) => v === true || v === "true" || v === "1" || v === 1, z.boolean())
    .optional()
    .default(false),

  // Postgres credentials — must be supplied via environment in real deployments.
  POSTGRES_HOST: z.string().optional().default("localhost"),
  POSTGRES_PORT: z.string().default("5432"),
  POSTGRES_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  POSTGRES_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
  POSTGRES_DB: z.preprocess(emptyToUndefined, z.string().optional()),

  // AWS credentials — never commit real keys; leave unset to use instance/profile credentials.
  AWS_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  AWS_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  AWS_REGION: z.string().default("ap-south-1"),

  // MySQL credentials
  MYSQL_HOST: z.string().optional().default("localhost"),
  MYSQL_PORT: z.string().optional().default("3306"),
  MYSQL_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  MYSQL_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
  MYSQL_DB: z.preprocess(emptyToUndefined, z.string().optional()),

  // MongoDB credentials
  MONGODB_URI: z.string().optional().default("mongodb://localhost:27017"),
  MONGODB_DB: z.string().optional().default("ingestion_db"),
  INGESTION_CRON: z.string().default("*/30 * * * *"),

  /** Alerting & notifications */
  ALERTS_ENABLED: z
    .preprocess((v) => v !== false && v !== "false" && v !== "0" && v !== 0, z.boolean())
    .optional()
    .default(true),
  ALERT_EMAIL_TO: z.preprocess(emptyToUndefined, z.string().optional()),
  ALERT_EMAIL_FROM: z.string().default("alerts@proteccio.local"),
  ALERT_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ALERT_DEDUPE_TTL_HOURS: z.coerce.number().int().positive().max(168).default(24),
  ALERT_REMEDIATION_OVERDUE_DAYS: z.coerce.number().int().positive().max(365).default(7),
  ALERT_QUEUE_POLL_MS: z.coerce.number().int().positive().max(60_000).default(500),
  ALERT_IN_APP_ENABLED: z
    .preprocess((v) => v !== false && v !== "false" && v !== "0" && v !== 0, z.boolean())
    .optional()
    .default(true),

  /** Performance: dashboard aggregate cache TTL (ms). */
  DASHBOARD_CACHE_TTL_MS: z.coerce.number().int().positive().max(600_000).default(30_000),
  /** Performance: background report generation poll interval (ms). */
  REPORT_QUEUE_POLL_MS: z.coerce.number().int().positive().max(60_000).default(500),
  /** Auto-enqueue report generation when catalog size exceeds this threshold. */
  ASYNC_REPORT_THRESHOLD_DATASETS: z.coerce.number().int().positive().max(100_000).default(100),
  REPORT_MAX_COMPLIANCE_ROWS: z.coerce.number().int().positive().max(10_000).default(500),
  REPORT_MAX_REMEDIATION_TICKETS: z.coerce.number().int().positive().max(10_000).default(500)
});

const parsed = EnvSchema.parse(process.env);

export const env = {
  ...parsed,
  /** RBAC + JWT authentication active when `JWT_SECRET` is configured. */
  RBAC_ENABLED: Boolean(parsed.JWT_SECRET?.trim())
};
