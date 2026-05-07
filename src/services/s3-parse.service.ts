import path from "node:path";
import readline from "node:readline";
import { parse as parseCsv } from "csv-parse";
import { S3Connector } from "../connectors/s3.connector";
import { createUtf8ValidatedTextStream } from "../utils/utf8";

const DEFAULT_MAX_RECORDS = 100;

interface ParseS3Input {
  bucket: string;
  key: string;
  maxRecords?: number;
}

type ParserKind = "csv" | "json" | "txt";

function safeDestroy(stream: NodeJS.ReadableStream): void {
  const destroyable = stream as NodeJS.ReadableStream & { destroy?: () => void };
  if (typeof destroyable.destroy === "function") {
    destroyable.destroy();
  }
}

function resolveParserKind(key: string, contentType?: unknown): ParserKind {
  const ext = path.extname(key).toLowerCase();
  if (ext === ".csv") return "csv";
  if (ext === ".json") return "json";
  if (ext === ".txt") return "txt";

  const normalizedType = String(contentType ?? "").toLowerCase();
  if (normalizedType.includes("csv")) return "csv";
  if (normalizedType.includes("json")) return "json";
  return "txt";
}

async function parseCsvStream(stream: NodeJS.ReadableStream, maxRecords: number): Promise<Record<string, unknown>[]> {
  return await new Promise((resolve, reject) => {
    const records: Record<string, unknown>[] = [];
    const utf8 = createUtf8ValidatedTextStream();
    const parser = parseCsv({
      columns: true,
      trim: true,
      skip_empty_lines: true
    });

    let done = false;
    const finalize = () => {
      if (done) return;
      done = true;
      resolve(records);
    };

    parser.on("readable", () => {
      let record = parser.read() as Record<string, unknown> | null;
      while (record) {
        records.push(record);
        if (records.length >= maxRecords) {
          safeDestroy(stream);
          parser.destroy();
          finalize();
          return;
        }
        record = parser.read() as Record<string, unknown> | null;
      }
    });
    parser.on("error", reject);
    parser.on("end", finalize);
    stream.on("error", reject);
    utf8.on("error", reject);

    stream.pipe(utf8).pipe(parser);
  });
}

async function parseTextLines(stream: NodeJS.ReadableStream, maxRecords: number): Promise<Record<string, unknown>[]> {
  const utf8 = createUtf8ValidatedTextStream();
  stream.on("error", (err) => utf8.destroy(err as Error));
  const rl = readline.createInterface({ input: stream.pipe(utf8), crlfDelay: Infinity });
  const lines: Record<string, unknown>[] = [];
  for await (const line of rl) {
    lines.push({ line });
    if (lines.length >= maxRecords) {
      rl.close();
      safeDestroy(stream);
      break;
    }
  }
  return lines;
}

async function parseJsonStream(stream: NodeJS.ReadableStream, maxRecords: number): Promise<Record<string, unknown>[]> {
  const utf8 = createUtf8ValidatedTextStream();
  stream.on("error", (err) => utf8.destroy(err as Error));
  const rl = readline.createInterface({ input: stream.pipe(utf8), crlfDelay: Infinity });
  const lines: string[] = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    lines.push(trimmed);
    if (lines.length >= maxRecords) break;
  }

  const ndjsonRecords: Record<string, unknown>[] = [];
  let ndjsonFailure = false;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        ndjsonRecords.push(parsed as Record<string, unknown>);
      } else {
        ndjsonRecords.push({ value: parsed });
      }
    } catch {
      ndjsonFailure = true;
      break;
    }
  }

  if (!ndjsonFailure && ndjsonRecords.length > 0) {
    return ndjsonRecords.slice(0, maxRecords);
  }

  const joined = lines.join("");
  if (!joined) return [];
  const parsed = JSON.parse(joined);
  if (Array.isArray(parsed)) {
    return parsed.slice(0, maxRecords).map((entry) => {
      if (entry && typeof entry === "object") return entry as Record<string, unknown>;
      return { value: entry };
    });
  }
  if (parsed && typeof parsed === "object") {
    return [parsed as Record<string, unknown>];
  }
  return [{ value: parsed }];
}

export async function parseS3ObjectPreview(input: ParseS3Input): Promise<{
  parser: ParserKind;
  metadata: Record<string, unknown>;
  records: Record<string, unknown>[];
}> {
  const connector = new S3Connector();
  const metadata = await connector.getObjectMetadata(input.bucket, input.key);
  const parser = resolveParserKind(input.key, metadata.contentType);
  const maxRecords = Math.max(1, input.maxRecords ?? DEFAULT_MAX_RECORDS);
  const stream = await connector.readTextFileStream(input.bucket, input.key);

  let records: Record<string, unknown>[];
  if (parser === "csv") {
    records = await parseCsvStream(stream, maxRecords);
  } else if (parser === "json") {
    records = await parseJsonStream(stream, maxRecords);
  } else {
    records = await parseTextLines(stream, maxRecords);
  }

  return {
    parser,
    metadata,
    records
  };
}

export async function ingestS3ObjectBatches(
  input: ParseS3Input & { batchSize: number },
  onBatch: (records: Record<string, unknown>[]) => Promise<void>
): Promise<{ parser: ParserKind; recordCount: number; metadata: Record<string, unknown> }> {
  const connector = new S3Connector();
  const metadata = await connector.getObjectMetadata(input.bucket, input.key);
  const parser = resolveParserKind(input.key, metadata.contentType);
  const stream = await connector.readTextFileStream(input.bucket, input.key);

  const maxRecords = input.maxRecords !== undefined ? Math.max(1, input.maxRecords) : undefined;
  let recordCount = 0;

  const maybeStop = () => {
    if (maxRecords === undefined) return false;
    return recordCount >= maxRecords;
  };

  const batchSize = Math.max(1, input.batchSize);

  if (parser === "csv") {
    const utf8 = createUtf8ValidatedTextStream();
    const parserStream = parseCsv({
      columns: true,
      trim: true,
      skip_empty_lines: true
    });

    stream.pipe(utf8).pipe(parserStream);

    let batch: Record<string, unknown>[] = [];
    for await (const record of parserStream as unknown as AsyncIterable<Record<string, unknown>>) {
      if (maybeStop()) {
        safeDestroy(stream);
        parserStream.destroy();
        break;
      }

      batch.push(record);
      recordCount += 1;

      if (batch.length >= batchSize) {
        await onBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0 && !maybeStop()) {
      await onBatch(batch);
    }
  } else if (parser === "json") {
    // Streaming JSON ingestion is only supported for NDJSON-style files (one JSON object per line).
    await new Promise<void>((resolve, reject) => {
      const utf8 = createUtf8ValidatedTextStream();
      stream.on("error", (err) => utf8.destroy(err as Error));
      const rl = readline.createInterface({ input: stream.pipe(utf8), crlfDelay: Infinity });

      let batch: Record<string, unknown>[] = [];
      const flush = async () => {
        if (batch.length === 0) return;
        const toSend = batch;
        batch = [];
        await onBatch(toSend);
      };

      rl.on("line", async (rawLine) => {
        try {
          if (maybeStop()) {
            rl.close();
            safeDestroy(stream);
            resolve();
            return;
          }

          const line = rawLine.trim();
          if (!line) return;

          // NDJSON expected: each line is a single JSON object/primitive.
          const parsed = JSON.parse(line) as unknown;
          const record =
            parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed };

          batch.push(record);
          recordCount += 1;

          if (batch.length >= batchSize) {
            rl.pause();
            await flush();
            rl.resume();
          }
        } catch (err) {
          reject(err);
        }
      });

      rl.on("close", async () => {
        try {
          await flush();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  } else {
    // TXT: treat each line as a record: { line: "..." }
    await new Promise<void>((resolve, reject) => {
      const utf8 = createUtf8ValidatedTextStream();
      stream.on("error", (err) => utf8.destroy(err as Error));
      const rl = readline.createInterface({ input: stream.pipe(utf8), crlfDelay: Infinity });

      let batch: Record<string, unknown>[] = [];
      const flush = async () => {
        if (batch.length === 0) return;
        const toSend = batch;
        batch = [];
        await onBatch(toSend);
      };

      rl.on("line", async (rawLine) => {
        try {
          if (maybeStop()) {
            rl.close();
            safeDestroy(stream);
            resolve();
            return;
          }

          batch.push({ line: String(rawLine) });
          recordCount += 1;
          if (batch.length >= batchSize) {
            rl.pause();
            await flush();
            rl.resume();
          }
        } catch (err) {
          reject(err);
        }
      });

      rl.on("close", async () => {
        try {
          await flush();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  return { parser, recordCount, metadata };
}
