# Data Ingestion and Privacy Intelligence Backend

## Project Overview

This project is a secure, modular backend for **Week 1 (ingestion)** plus **Week 2 (discovery → classification → mapping → profiling → risk → search → dashboard → audit)**.

**Ingestion sources**
- Databases: PostgreSQL, MySQL, MongoDB
- Cloud storage: AWS S3
- Files: CSV, JSON, TXT, XLSX, PDF (preview + normalization)
- External APIs: GET/POST ingestion with retry and pagination support

**Governance layer**
- Sensitive data discovery (nested structures, batching, masked samples in API output)
- Multi-label classification with confidence and reasoning
- System/dataset/field mapping, flows, lineage, duplicate sensitive patterns
- Dataset profiling (nulls, duplicates, completeness, anomalies)
- Heuristic risk scoring (low / medium / high / critical)
- Search, dashboard aggregates, and structured audit trail

The service normalizes records, generates metadata, and keeps ingestion history. Optional `discovery: true` on selected ingest endpoints runs discovery on the same normalized batch.

## Setup Instructions

### Prerequisites
- Node.js 18+ (recommended)
- npm
- Optional: running Postgres/MySQL/MongoDB instances and AWS credentials for full connector testing

### Steps
1. Install dependencies:
   - `npm install`
2. Create env file:
   - Windows: `copy .env.example .env`
   - macOS/Linux: `cp .env.example .env`
3. Fill values in `.env` for the connectors you want to test.
4. Start server in development mode:
   - `npm run dev`

By default, app runs on `http://localhost:3000`.

## Tech Stack Used

- Runtime: Node.js + TypeScript
- API framework: Express
- Validation/config: Zod + dotenv
- Logging: pino + pino-http
- Database clients: `pg`, `mysql2`, `mongodb`
- Cloud SDK: AWS SDK v3 (`@aws-sdk/client-s3`)
- File ingestion/parsing: `multer`, `csv-parse`, `xlsx`, `pdf-parse`
- Scheduling: `node-cron`

## Architecture (High-Level Flow)

1. Request enters Express routes (`/api/*`).
2. Source connector reads data (DB, S3, file, or API).
3. Data is normalized (types, flattening, date normalization, UTF-8 checks where applicable).
4. Metadata is generated for lineage and observability.
5. Optional discovery/classification/mapping/profiling run via dedicated APIs or `discovery: true` on some ingest calls.
6. Ingestion job status is recorded in history.
7. Response returns sample/preview + metadata (or record count for full ingestion).

Core modules:
- `src/routes/ingestion.routes.ts` — ingestion endpoints
- `src/discovery/*` — discovery engine (flatten, detectors, Verhoeff/Luhn, batched scan)
- `src/classification/*` — classification engine and category→label rules
- `src/mapping/*` — mapping registry, lineage, duplicate groups
- `src/profiling/*` — profiling reports
- `src/risk/*` — risk scoring
- `src/catalog/*` — in-memory governance catalog (swap for PostgreSQL/MongoDB in production)
- `src/audit/*` — audit trail service
- `src/connectors/*` — source-specific integrations
- `src/services/normalizer.ts` — normalization pipeline
- `src/services/metadata.ts` — metadata builder
- `src/services/ingestion.service.ts` — history + scheduling orchestration

## Assumptions Made

- Credentials and connection details are provided through environment variables (no hardcoded secrets).
- Database entities (`tableName`, `collectionName`) are validated as safe identifiers.
- Full ingestion endpoints are expected to be used with reasonable `batchSize` and optional `maxRecords`.
- Upload and preview behavior for some heavy formats (like PST/OST) is intentionally limited in this version.
- When `API_KEY` is set in `.env`, mutating and analytics routes under `/api/*` require `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>` (the `/health` route stays open for probes).
- Governance catalog, mapping registry, and audit entries are **in-memory** in this repo version; persist them to PostgreSQL or MongoDB for multi-instance production.

## API documentation

| Artifact | Description |
|----------|-------------|
| **Swagger UI** | Open [http://localhost:3000/docs](http://localhost:3000/docs) while the server is running. Interactive “Try it out” for all documented routes. No API key required for `/docs` or `/openapi.json`. |
| **OpenAPI 3.0** | Machine-readable spec: [openapi/openapi.json](openapi/openapi.json) — also served at `GET /openapi.json`. |
| **Postman** | Import [postman_collection.json](postman_collection.json) (Collection v2.1). Set variables `baseUrl` (e.g. `http://localhost:3000`) and `apiKey` when the server has `API_KEY` set. |

Regenerate the OpenAPI file and Postman collection from the route list (after adding or renaming endpoints):

```bash
npm run docs:generate
```

### Authentication

When `API_KEY` is set, protected routes need `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>`. In Swagger UI, use **Authorize** and enter your key as a Bearer token (or add the header manually). `/health`, `/docs`, `/openapi.json`, and the static dashboard are not API-key gated.

### curl examples (quick start)

Base URL: `http://localhost:3000`

**Health**

```bash
curl -s "http://localhost:3000/health"
```

**Response**

```json
{ "ok": true }
```

**Postgres health**

```bash
curl -s "http://localhost:3000/api/db/postgres/health"
```

**API ingest (example)**

```bash
curl -s -X POST "http://localhost:3000/api/ingest/api" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://jsonplaceholder.typicode.com/posts\",\"method\":\"GET\"}"
```

**Example success shape** (truncated)

```json
{
  "recordCount": 100,
  "metadata": { "sourceType": "api", "entityName": "api-response" },
  "sample": []
}
```

**Discovery scan**

```bash
curl -s -X POST "http://localhost:3000/api/discovery/scan" \
  -H "Content-Type: application/json" \
  -d "{\"records\":[{\"email\":\"user@example.com\"}],\"sourceType\":\"file\",\"sourceName\":\"demo\",\"entityName\":\"batch-1\"}"
```

**Audit logs**

```bash
curl -s "http://localhost:3000/api/audit/logs?limit=10"
```

**Example response**

```json
{
  "count": 1,
  "items": [
    {
      "id": "…",
      "timestamp": "2026-05-15T12:00:00.000Z",
      "source": "api:discovery/scan",
      "action": "discovery_scan",
      "status": "success",
      "durationMs": 42
    }
  ]
}
```

For every path, request body schema, and response patterns, use **Swagger UI** or **openapi/openapi.json**.

### Optional discovery on ingest

For `POST /api/ingest/api`, `POST /api/ingest/file/preview`, `POST /api/ingest/s3/preview`, and `POST /api/ingest/postgres/table/preview`, include JSON field `"discovery": true` to attach a `discovery` object (masked samples; no raw sensitive values in logs by design).

---

## Privacy intelligence APIs (Week 2) — route index

Unless `API_KEY` is unset, add a header: `Authorization: Bearer <your API_KEY>` or `X-API-Key: <your API_KEY>`.

### Discovery

- `POST /api/discovery/scan` — body: `{ "records": [ {...} ], "sourceType": "database|file|api|cloud", "sourceName", "entityName", "classify": true?, "batchSize"?: number }`
- `GET /api/discovery/categories` — supported sensitive categories

### Classification

- `POST /api/classification/classify` — body: `{ "discovery": <DiscoveryScanResult> }`

### Mapping and lineage

- `POST /api/mapping/datasets` — register dataset/system ids (aligns with discovery trace)
- `POST /api/mapping/from-scan` — body: `{ "discovery", "classification"? }`
- `POST /api/mapping/flows` — declare replication / backup / API exposure between datasets
- `GET /api/mapping/datasets`, `/mapping/systems`, `/mapping/fields`, `/mapping/flows`
- `GET /api/mapping/lineage/dataset/:datasetId`, `/mapping/lineage/field/:fieldId`
- `GET /api/mapping/duplicates`, `/mapping/export`

### Profiling, risk, catalog

- `POST /api/profiling/profile` — body: `{ "discovery", "classification"?, "records"?, "persist"?: true, "profilingOptions"?, "exposureHints"? }` — returns `profile`, `risk`, and optional `catalog` when `persist: true`
- `POST /api/catalog/register` — persist snapshot to in-memory catalog
- `GET /api/catalog/datasets`

### Search

- `GET /api/search/datasets` — query: `riskLevel`, `classification`, `sourceType`, `sourceName`, `detectionType` / `detectionCategory`, `mappedOnly`, `page`, `pageSize`
- `GET /api/search/mapped-fields` — query: `datasetId`, `sensitiveCategory`, pagination
- `GET /api/search/duplicate-sensitive` — cross-source duplicate semantics

### Dashboard

- `GET /api/dashboard/analytics` — full payload for the UI
- `GET /api/dashboard/summary` — aggregates
- Additional metrics: `/api/dashboard/metrics/*` (see OpenAPI)

### Audit

- `GET /api/audit/logs` — query: `limit`, `action`, `status`, `sourcePrefix`

