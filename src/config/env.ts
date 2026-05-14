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
  INGESTION_CRON: z.string().default("*/30 * * * *")
});

export const env = EnvSchema.parse(process.env);
