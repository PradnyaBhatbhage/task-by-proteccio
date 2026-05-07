import mysql from "mysql2/promise";
import { env } from "../config/env";
import { withRetry } from "../utils/retry";
import { assertSafeIdentifier } from "../utils/identifiers";

export class MySQLConnector {
  private pool: mysql.Pool;

  constructor() {
    if (!env.MYSQL_HOST || !env.MYSQL_PORT || !env.MYSQL_DB || !env.MYSQL_USER || !env.MYSQL_PASSWORD) {
      // Allow server to boot without DB creds if user doesn't call MySQL APIs.
      // Actual calls will fail with a clearer error.
    }

    this.pool = mysql.createPool({
      host: env.MYSQL_HOST ?? "localhost",
      port: Number(env.MYSQL_PORT ?? 3306),
      user: env.MYSQL_USER ?? "",
      password: env.MYSQL_PASSWORD ?? "",
      database: env.MYSQL_DB ?? "",
      connectionLimit: 10,
      waitForConnections: true,
      connectTimeout: 5000
    });
  }

  private requireCreds(): void {
    const missing: string[] = [];
    if (!env.MYSQL_HOST) missing.push("MYSQL_HOST");
    if (!env.MYSQL_PORT) missing.push("MYSQL_PORT");
    if (!env.MYSQL_USER) missing.push("MYSQL_USER");
    if (!env.MYSQL_PASSWORD) missing.push("MYSQL_PASSWORD");
    if (!env.MYSQL_DB) missing.push("MYSQL_DB");
    if (missing.length) {
      throw new Error(`Missing MySQL env vars: ${missing.join(", ")}`);
    }
  }

  async validateConnection(): Promise<boolean> {
    this.requireCreds();
    const result = await withRetry(() => this.pool.query("SELECT 1 as ok"), 1);
    const rows = result[0] as Array<{ ok: number }>;
    return rows[0]?.ok === 1;
  }

  async listTables(schema?: string): Promise<string[]> {
    this.requireCreds();
    const tableSchema = schema ?? env.MYSQL_DB;
    if (!tableSchema) throw new Error("MySQL schema/database is required");

    const result = await this.pool.query(
      `SELECT table_name AS tableName
       FROM information_schema.tables
       WHERE table_schema = ?
       ORDER BY table_name`,
      [tableSchema]
    );
    const rows = result[0] as Array<{ tableName?: string }>;
    return rows.map((r) => r.tableName ?? "").filter(Boolean);
  }

  async getColumns(tableName: string, schema?: string): Promise<Array<{ column: string; type: string }>> {
    this.requireCreds();
    assertSafeIdentifier(tableName, "tableName");
    const tableSchema = schema ?? env.MYSQL_DB;
    if (!tableSchema) throw new Error("MySQL schema/database is required");

    const result = await this.pool.query(
      `SELECT column_name AS columnName, data_type AS dataType
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [tableSchema, tableName]
    );
    const rows = result[0] as Array<{ columnName?: string; dataType?: string }>;
    return rows
      .filter((r) => Boolean(r.columnName))
      .map((r) => ({ column: String(r.columnName), type: String(r.dataType ?? "unknown") }));
  }

  async fetchSample(tableName: string, limit = 50, schema?: string): Promise<Record<string, unknown>[]> {
    this.requireCreds();
    assertSafeIdentifier(tableName, "tableName");
    const tableSchema = schema ?? env.MYSQL_DB;
    if (!tableSchema) throw new Error("MySQL schema/database is required");

    const result = await this.pool.query(`SELECT * FROM \`${tableName}\` LIMIT ?`, [limit]);
    const rows = result[0] as Array<Record<string, unknown>>;
    return rows;
  }

  async fetchBatch(
    tableName: string,
    limit = 1000,
    offset = 0,
    schema?: string
  ): Promise<Record<string, unknown>[]> {
    this.requireCreds();
    assertSafeIdentifier(tableName, "tableName");
    const tableSchema = schema ?? env.MYSQL_DB;
    if (!tableSchema) throw new Error("MySQL schema/database is required");

    const result = await this.pool.query(`SELECT * FROM \`${tableName}\` LIMIT ? OFFSET ?`, [limit, offset]);
    const rows = result[0] as Array<Record<string, unknown>>;
    return rows;
  }
}

