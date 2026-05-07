import { Pool } from "pg";
import { env } from "../config/env";
import { withRetry } from "../utils/retry";
import { assertSafeIdentifier } from "../utils/identifiers";

export class PostgresConnector {
  private pool: Pool;

  constructor() {
    // Don't hardcode credentials; we'll validate that they exist when an API is called.
    this.pool = new Pool({
      host: env.POSTGRES_HOST,
      port: Number(env.POSTGRES_PORT),
      user: env.POSTGRES_USER ?? "",
      password: env.POSTGRES_PASSWORD ?? "",
      database: env.POSTGRES_DB ?? "",
      max: 10,
      connectionTimeoutMillis: 5000
    });
  }

  private requireCreds(): void {
    const missing: string[] = [];
    if (!env.POSTGRES_USER) missing.push("POSTGRES_USER");
    if (!env.POSTGRES_PASSWORD) missing.push("POSTGRES_PASSWORD");
    if (!env.POSTGRES_DB) missing.push("POSTGRES_DB");
    if (missing.length) {
      throw new Error(`Missing Postgres env vars: ${missing.join(", ")}`);
    }
  }

  async validateConnection(): Promise<boolean> {
    this.requireCreds();
    const result = await withRetry(() => this.pool.query("SELECT 1 as ok"), 1);
    return result.rows[0]?.ok === 1;
  }

  async listTables(schema = "public"): Promise<string[]> {
    this.requireCreds();
    assertSafeIdentifier(schema, "schemaName");
    const result = await this.pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
       ORDER BY table_name`,
      [schema]
    );
    return result.rows.map((r) => r.table_name as string);
  }

  async getColumns(tableName: string, schema = "public"): Promise<Array<{ column: string; type: string }>> {
    this.requireCreds();
    assertSafeIdentifier(schema, "schemaName");
    assertSafeIdentifier(tableName, "tableName");
    const result = await this.pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, tableName]
    );
    return result.rows.map((r) => ({ column: r.column_name as string, type: r.data_type as string }));
  }

  async fetchSample(tableName: string, limit = 50, schema = "public"): Promise<Record<string, unknown>[]> {
    assertSafeIdentifier(tableName, "tableName");
    assertSafeIdentifier(schema, "schemaName");
    this.requireCreds();
    const result = await this.pool.query(
      `SELECT * FROM "${schema}"."${tableName}" LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async fetchBatch(tableName: string, limit = 1000, offset = 0, schema = "public"): Promise<Record<string, unknown>[]> {
    assertSafeIdentifier(tableName, "tableName");
    assertSafeIdentifier(schema, "schemaName");
    this.requireCreds();
    const result = await this.pool.query(
      `SELECT * FROM "${schema}"."${tableName}" LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }
}
