import axios, { AxiosRequestHeaders, Method } from "axios";
import { withRetry } from "../utils/retry";

interface ApiIngestInput {
  url: string;
  method?: "GET" | "POST";
  headers?: AxiosRequestHeaders;
  body?: unknown;
  pageParam?: string;
  startPage?: number;
  maxPages?: number;
}

export async function ingestFromApi(input: ApiIngestInput): Promise<unknown[]> {
  if (!input.url.startsWith("https://")) {
    throw new Error("Only HTTPS endpoints are allowed.");
  }

  const method: Method = input.method ?? "GET";
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
          headers: input.headers,
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
