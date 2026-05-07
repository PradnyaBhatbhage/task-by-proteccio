import { MongoClient } from "mongodb";
import { env } from "../config/env";
import { withRetry } from "../utils/retry";
import { assertSafeIdentifier } from "../utils/identifiers";

type MongoValueType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "array"
  | "object"
  | "date"
  | "unknown";

function inferValueType(value: unknown): MongoValueType {
  if (value === null) return "null";
  if (value === undefined) return "unknown";
  if (value instanceof Date) return "date";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "object") return "object";
  return "unknown";
}

function inferTypesFromDocument(doc: unknown, prefix = "", out: Record<string, MongoValueType>) {
  if (!doc || typeof doc !== "object") return;
  const record = doc as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      inferTypesFromDocument(value, path, out);
      continue;
    }
    if (Array.isArray(value)) {
      out[path] = "array";
      continue;
    }
    out[path] = inferValueType(value);
  }
}

function mergeType(a: MongoValueType, b: MongoValueType): MongoValueType {
  if (a === b) return a;
  // If a field has mixed types across samples, treat it as object.
  if (a === "null") return b;
  if (b === "null") return a;
  return "object";
}

export class MongoDBConnector {
  private client: MongoClient;
  private dbName: string;
  private db: Awaited<ReturnType<MongoClient["db"]>> | null = null;

  constructor() {
    this.client = new MongoClient(env.MONGODB_URI ?? "");
    this.dbName = env.MONGODB_DB ?? "";
  }

  private requireCreds(): void {
    const missing: string[] = [];
    if (!env.MONGODB_URI) missing.push("MONGODB_URI");
    if (!env.MONGODB_DB) missing.push("MONGODB_DB");
    if (missing.length) throw new Error(`Missing Mongo env vars: ${missing.join(", ")}`);
  }

  private async ensureConnected(): Promise<void> {
    this.requireCreds();
    if (!this.db) {
      await withRetry(() => this.client.connect(), 1);
      this.db = this.client.db(this.dbName);
    }
  }

  async validateConnection(): Promise<boolean> {
    this.requireCreds();
    await withRetry(async () => {
      const db = this.client.db(this.dbName);
      await db.command({ ping: 1 });
    }, 1);
    return true;
  }

  async listCollections(): Promise<string[]> {
    await this.ensureConnected();
    const cols = await this.db!.listCollections().toArray();
    return cols.map((c) => String(c.name));
  }

  async getFieldsAndTypes(collectionName: string, sampleSize = 100): Promise<Array<{ field: string; type: string }>> {
    await this.ensureConnected();
    assertSafeIdentifier(collectionName, "collectionName");
    const coll = this.db!.collection(collectionName);

    const sampleDocs = await coll
      .find({})
      .limit(sampleSize)
      .project({ _id: 0 })
      .toArray();

    const merged: Record<string, MongoValueType> = {};
    for (const doc of sampleDocs) {
      const local: Record<string, MongoValueType> = {};
      inferTypesFromDocument(doc, "", local);
      for (const [field, type] of Object.entries(local)) {
        merged[field] = merged[field] ? mergeType(merged[field], type) : type;
      }
    }

    return Object.entries(merged)
      .map(([field, type]) => ({ field, type }))
      .sort((a, b) => a.field.localeCompare(b.field));
  }

  async fetchSample(collectionName: string, limit = 50): Promise<Record<string, unknown>[]> {
    await this.ensureConnected();
    assertSafeIdentifier(collectionName, "collectionName");
    const coll = this.db!.collection(collectionName);
    const docs = await coll.find({}).limit(limit).project({ _id: 0 }).toArray();
    return docs as Array<Record<string, unknown>>;
  }

  async fetchBatch(
    collectionName: string,
    limit = 1000,
    offset = 0
  ): Promise<Record<string, unknown>[]> {
    await this.ensureConnected();
    assertSafeIdentifier(collectionName, "collectionName");
    const coll = this.db!.collection(collectionName);
    const docs = await coll
      .find({})
      .skip(offset)
      .limit(limit)
      .sort({ _id: 1 })
      .project({ _id: 0 })
      .toArray();
    return docs as Array<Record<string, unknown>>;
  }
}

