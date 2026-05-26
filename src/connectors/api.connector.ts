import axios, { type AxiosRequestHeaders, type Method } from "axios";
import { withRetry } from "../utils/retry";
import { assertPublicHttpsUrl } from "../utils/ssrf";

interface ApiIngestInput {
  url: string;
  method?: "GET" | "POST";
  headers?: AxiosRequestHeaders;
  body?: unknown;
  pageParam?: string;
  startPage?: number;
  maxPages?: number;
}

const BLOCKED_OUTBOUND_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-api-key",
  "proxy-authorization",
  "x-forwarded-for",
  "x-real-ip"
]);

function sanitizeOutboundHeaders(headers?: AxiosRequestHeaders): AxiosRequestHeaders | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (BLOCKED_OUTBOUND_HEADERS.has(key.toLowerCase())) continue;
    if (typeof value === "string") out[key] = value;
  }
  return Object.keys(out).length > 0 ? (out as AxiosRequestHeaders) : undefined;
}

export async function ingestFromApi(input: ApiIngestInput): Promise<unknown[]> {
  assertPublicHttpsUrl(input.url);

  const method: Method = input.method ?? "GET";
  const headers = sanitizeOutboundHeaders(input.headers);
  const pageParam = input.pageParam ?? "page";
  let page = input.startPage ?? 1;
  const maxPages = input.maxPages ?? 10;
  const records: unknown[] = [];

  while (page <= maxPages) {
    const response = await withRetry(
      async () =>
        axios.request({
          url: input.url,
          method,
          headers,
          data: input.body,
          params: { [pageParam]: page },
          timeout: 10000
        }),
      2
    );

    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    const payload = response.data;
    if (Array.isArray(payload)) {
      records.push(...payload);
      if (payload.length === 0) break;
    } else if (Array.isArray(payload?.data)) {
      records.push(...payload.data);
      if (payload.data.length === 0) break;
    } else {
      records.push(payload);
      break;
    }

    page += 1;
  }

  return records;
}
