import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: [
    "req.headers.authorization",
    "req.headers['x-api-key']",
    "password",
    "secretKey",
    "AWS_SECRET_ACCESS_KEY",
    "MYSQL_PASSWORD",
    "POSTGRES_PASSWORD"
  ]
});
