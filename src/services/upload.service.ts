import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { env } from "../config/env";

const MALWARE_SCAN_SAMPLE_BYTES = 2 * 1024 * 1024;
const allowedExtensions = new Set([".csv", ".json", ".txt", ".xlsx", ".pdf", ".pst", ".ost"]);
const riskyInnerExtensions = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".js",
  ".vbs",
  ".ps1",
  ".scr"
]);
const allowedMimeByExtension: Record<string, string[]> = {
  ".csv": ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"],
  ".json": ["application/json", "text/json", "text/plain"],
  ".txt": ["text/plain"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream"
  ],
  ".pdf": ["application/pdf", "application/octet-stream"],
  ".pst": ["application/vnd.ms-outlook", "application/octet-stream"],
  ".ost": ["application/vnd.ms-outlook", "application/octet-stream"]
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "uploads"),
  filename: (_req, file, cb) => {
    const uniqueId = randomUUID();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueId}${ext}`);
  }
});

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const safeName = path.basename(file.originalname).trim().toLowerCase();
  const ext = path.extname(safeName);
  if (!allowedExtensions.has(ext)) {
    cb(new Error("Unsupported file format"));
    return;
  }

  const nameWithoutExt = safeName.slice(0, safeName.length - ext.length);
  const innerExt = path.extname(nameWithoutExt);
  if (innerExt && riskyInnerExtensions.has(innerExt)) {
    cb(new Error("Double extension with executable/script type is not allowed"));
    return;
  }

  const allowedMimes = allowedMimeByExtension[ext] ?? [];
  const normalizedMime = String(file.mimetype ?? "").toLowerCase();
  if (allowedMimes.length > 0 && normalizedMime && !allowedMimes.includes(normalizedMime)) {
    cb(new Error(`MIME type '${normalizedMime}' does not match file extension '${ext}'`));
    return;
  }
  cb(null, true);
}

export async function runBasicMalwareScan(filePath: string): Promise<void> {
  const handle = await fs.open(filePath, "r");
  let sample: Buffer;
  try {
    const buffer = Buffer.alloc(MALWARE_SCAN_SAMPLE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MALWARE_SCAN_SAMPLE_BYTES, 0);
    sample = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const content = sample.toString("latin1");

  if (content.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")) {
    throw new Error("Malware signature detected (EICAR).");
  }

  // Basic executable signature checks to prevent disguised binaries.
  const isWindowsExecutable = sample.length >= 2 && sample[0] === 0x4d && sample[1] === 0x5a;
  const isElfBinary =
    sample.length >= 4 &&
    sample[0] === 0x7f &&
    sample[1] === 0x45 &&
    sample[2] === 0x4c &&
    sample[3] === 0x46;

  if (isWindowsExecutable || isElfBinary) {
    throw new Error("Potential malicious executable content detected.");
  }
}

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.UPLOAD_MAX_FILE_SIZE_BYTES,
    files: 1
  }
});
