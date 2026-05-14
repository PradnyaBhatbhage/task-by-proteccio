import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { parse as parseCsv } from "csv-parse";
import * as XLSX from "xlsx";
import { createUtf8ValidatedTextStream } from "../utils/utf8";

const DEFAULT_MAX_RECORDS = 100;

type UploadParser = "csv" | "json" | "txt" | "xlsx" | "pdf" | "pst" | "ost";

interface ParseUploadInput {
  filePath: string;
  originalName: string;
  maxRecords?: number;
}

function getParserFromName(originalName: string): UploadParser {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === ".csv") return "csv";
  if (ext === ".json") return "json";
  if (ext === ".txt") return "txt";
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".pdf") return "pdf";
  if (ext === ".pst") return "pst";
  return "ost";
}

function safeRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

async function parseCsvFile(filePath: string, maxRecords: number): Promise<Record<string, unknown>[]> {
  const stream = fs.createReadStream(filePath);
  return await new Promise((resolve, reject) => {
    const records: Record<string, unknown>[] = [];
    const utf8 = createUtf8ValidatedTextStream();
    const parser = parseCsv({
      columns: true,
      trim: true,
      skip_empty_lines: true
    });

    parser.on("readable", () => {
      let row = parser.read() as Record<string, unknown> | null;
      while (row) {
        records.push(row);
        if (records.length >= maxRecords) {
          stream.destroy();
          parser.destroy();
          resolve(records);
          return;
        }
        row = parser.read() as Record<string, unknown> | null;
      }
    });
    parser.on("error", reject);
    parser.on("end", () => resolve(records));
    stream.on("error", reject);
    utf8.on("error", reject);

    stream.pipe(utf8).pipe(parser);
  });
}

async function parseJsonFile(filePath: string, maxRecords: number): Promise<Record<string, unknown>[]> {
  const stream = fs.createReadStream(filePath);
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

  const ndjson: Record<string, unknown>[] = [];
  let failed = false;
  for (const line of lines) {
    try {
      ndjson.push(safeRecord(JSON.parse(line)));
    } catch {
      failed = true;
      break;
    }
  }
  if (!failed && ndjson.length > 0) {
    return ndjson.slice(0, maxRecords);
  }

  const payload = JSON.parse(lines.join(""));
  if (Array.isArray(payload)) {
    return payload.slice(0, maxRecords).map(safeRecord);
  }
  return [safeRecord(payload)];
}

async function parseTxtFile(filePath: string, maxRecords: number): Promise<Record<string, unknown>[]> {
  const stream = fs.createReadStream(filePath);
  const utf8 = createUtf8ValidatedTextStream();
  stream.on("error", (err) => utf8.destroy(err as Error));
  const rl = readline.createInterface({ input: stream.pipe(utf8), crlfDelay: Infinity });
  const rows: Record<string, unknown>[] = [];
  for await (const line of rl) {
    rows.push({ line });
    if (rows.length >= maxRecords) break;
  }
  return rows;
}

function parseXlsxFile(filePath: string, maxRecords: number): Record<string, unknown>[] {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
  return rows.slice(0, maxRecords).map(safeRecord);
}

async function parsePdfFile(filePath: string, maxRecords: number): Promise<Record<string, unknown>[]> {
  const { PDFParse } = await import("pdf-parse");
  const fileBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: fileBuffer });
  const data = await parser.getText();
  const lines = data.text
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean)
    .slice(0, maxRecords);
  await parser.destroy();
  return lines.map((line) => ({ line }));
}

export async function parseUploadedFilePreview(input: ParseUploadInput): Promise<{
  parser: UploadParser;
  records: Record<string, unknown>[];
  warnings: string[];
}> {
  const parser = getParserFromName(input.originalName);
  const maxRecords = Math.max(1, input.maxRecords ?? DEFAULT_MAX_RECORDS);
  const warnings: string[] = [];

  if (parser === "pst" || parser === "ost") {
    warnings.push(`${parser.toUpperCase()} parsing is not enabled yet. Returning metadata-only preview.`);
    return { parser, warnings, records: [] };
  }

  if (parser === "csv") return { parser, warnings, records: await parseCsvFile(input.filePath, maxRecords) };
  if (parser === "json") return { parser, warnings, records: await parseJsonFile(input.filePath, maxRecords) };
  if (parser === "txt") return { parser, warnings, records: await parseTxtFile(input.filePath, maxRecords) };
  if (parser === "xlsx") return { parser, warnings, records: parseXlsxFile(input.filePath, maxRecords) };
  return { parser, warnings, records: await parsePdfFile(input.filePath, maxRecords) };
}
