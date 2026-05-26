import pino from "pino";

const redact: string[] = [
  "req.headers.authorization",
  "req.headers['x-api-key']",
  "req.headers.cookie",
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "secretKey",
  "apiKey",
  "API_KEY",
  "JWT_SECRET",
  "AWS_SECRET_ACCESS_KEY",
  "MYSQL_PASSWORD",
  "POSTGRES_PASSWORD",
  "*.password",
  "*.token",
  "*.secret",
  "*.apiKey"
];

const level = process.env.NODE_ENV === "production" ? "info" : "debug";

/** Sync stdout avoids worker/thread issues on Vercel / AWS Lambda. */
const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export const logger = serverless
  ? pino({ level, redact }, pino.destination({ sync: true, minLength: 0 }))
  : pino({ level, redact });
