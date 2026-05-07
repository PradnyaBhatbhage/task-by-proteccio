import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.string().default("development"),

  //Postgres credentials
  POSTGRES_HOST: z.string().optional().default("localhost"),
  POSTGRES_PORT: z.string().default("5432"),
  POSTGRES_USER: z.string().optional().default("postgres"),
  POSTGRES_PASSWORD: z.string().optional().default("root"),
  POSTGRES_DB: z.string().optional().default("ingestion_db"),

  //AWS credentials
  AWS_ACCESS_KEY_ID: z.string().optional().default(""),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(""),
  AWS_REGION: z.string().default("ap-south-1"),

  //MySQL credentials
  MYSQL_HOST: z.string().optional().default("localhost"),
  MYSQL_PORT: z.string().optional().default("3306"),
  MYSQL_USER: z.string().optional().default("root"),
  MYSQL_PASSWORD: z.string().optional().default("root"),
  MYSQL_DB: z.string().optional().default("ingestion_db"),

  //MongoDB credentials
  MONGODB_URI: z.string().optional().default("mongodb://localhost:27017"),
  MONGODB_DB: z.string().optional().default("ingestion_db"),
  INGESTION_CRON: z.string().default("*/30 * * * *")
});

export const env = EnvSchema.parse(process.env);
