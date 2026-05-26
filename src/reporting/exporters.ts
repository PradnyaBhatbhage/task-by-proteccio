import PDFDocument from "pdfkit";
import type { ReportContent, ExportFormat } from "./types";

function flattenValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function rowsFromSectionData(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data.map((row) =>
      typeof row === "object" && row !== null ? (row as Record<string, unknown>) : { value: row }
    );
  }
  if (typeof data === "object" && data !== null) {
    return [data as Record<string, unknown>];
  }
  return [{ value: data }];
}

/** Escape a CSV field value. */
function csvCell(value: unknown): string {
  const s = flattenValue(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Exports report content as JSON string (pretty-printed).
 */
export function exportReportJson(content: ReportContent): string {
  return JSON.stringify(content, null, 2);
}

/**
 * Exports report content as CSV with section headers and flattened rows.
 */
export function exportReportCsv(content: ReportContent): string {
  const lines: string[] = [
    "section,row_index,key,value",
    `meta,0,reportType,${csvCell(content.reportType)}`,
    `meta,0,title,${csvCell(content.title)}`,
    `meta,0,generatedAt,${csvCell(content.generatedAt)}`,
    `meta,0,summary,${csvCell(content.summary)}`
  ];

  for (const sec of content.sections) {
    const rows = rowsFromSectionData(sec.data);
    rows.forEach((row, rowIdx) => {
      for (const [key, value] of Object.entries(row)) {
        lines.push(`${csvCell(sec.id)},${rowIdx},${csvCell(key)},${csvCell(value)}`);
      }
    });
  }

  return lines.join("\n");
}

/**
 * Renders report content to a PDF buffer (audit-ready layout).
 */
export function exportReportPdf(content: ReportContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(content.title, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#444444");
    doc.text(`Report type: ${content.reportType}`);
    doc.text(`Generated: ${content.generatedAt}`);
    doc.text(`Summary: ${content.summary}`);
    doc.moveDown();

    doc.fillColor("#000000").fontSize(12);
    doc.text("Metadata", { underline: true });
    doc.fontSize(10);
    for (const [k, v] of Object.entries(content.metadata)) {
      doc.text(`${k}: ${flattenValue(v)}`);
    }
    doc.moveDown();

    for (const sec of content.sections) {
      doc.fontSize(12).fillColor("#000000").text(sec.title, { underline: true });
      if (sec.description) {
        doc.fontSize(9).fillColor("#555555").text(sec.description);
      }
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#000000");

      const rows = rowsFromSectionData(sec.data);
      const maxRows = 40;
      const slice = rows.slice(0, maxRows);

      for (let i = 0; i < slice.length; i++) {
        const row = slice[i]!;
        const parts = Object.entries(row)
          .slice(0, 12)
          .map(([k, v]) => `${k}=${flattenValue(v).slice(0, 80)}`);
        doc.text(`  [${i + 1}] ${parts.join(" | ")}`);
        if (doc.y > 720) {
          doc.addPage();
        }
      }

      if (rows.length > maxRows) {
        doc.text(`  … ${rows.length - maxRows} additional rows omitted from PDF`);
      }
      doc.moveDown();
    }

    doc.fontSize(8).fillColor("#888888").text("Proteccio Privacy Intelligence — audit-ready report", {
      align: "center"
    });

    doc.end();
  });
}

export function contentTypeForFormat(format: ExportFormat): string {
  switch (format) {
    case "json":
      return "application/json";
    case "csv":
      return "text/csv; charset=utf-8";
    case "pdf":
      return "application/pdf";
  }
}

export function fileExtension(format: ExportFormat): string {
  return format;
}

export async function exportReport(
  content: ReportContent,
  format: ExportFormat
): Promise<{ body: string | Buffer; contentType: string }> {
  switch (format) {
    case "json":
      return { body: exportReportJson(content), contentType: contentTypeForFormat("json") };
    case "csv":
      return { body: exportReportCsv(content), contentType: contentTypeForFormat("csv") };
    case "pdf":
      return { body: await exportReportPdf(content), contentType: contentTypeForFormat("pdf") };
  }
}
