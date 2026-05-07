# Data Ingestion and Source Integration Layer

## Project Overview

This project is a secure and scalable backend service for ingesting data from multiple sources:
- Databases: PostgreSQL, MySQL, MongoDB
- Cloud storage: AWS S3
- Files: CSV, JSON, TXT, XLSX, PDF (preview + normalization)
- External APIs: GET/POST ingestion with retry and pagination support

The service normalizes records, generates metadata, and keeps ingestion history for operational visibility.

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
5. Ingestion job status is recorded in history.
6. Response returns sample/preview + metadata (or record count for full ingestion).

Core modules:
- `src/routes/ingestion.routes.ts` - endpoint layer
- `src/connectors/*` - source-specific integrations
- `src/services/normalizer.ts` - normalization pipeline
- `src/services/metadata.ts` - metadata builder
- `src/services/ingestion.service.ts` - history + scheduling orchestration

## Assumptions Made

- Credentials and connection details are provided through environment variables.
- Database entities (`tableName`, `collectionName`) are validated as safe identifiers.
- Full ingestion endpoints are expected to be used with reasonable `batchSize` and optional `maxRecords`.
- Upload and preview behavior for some heavy formats (like PST/OST) is intentionally limited in this version.
- Authentication/authorization is out of scope for this assignment and can be added as production hardening.

## API Documentation

You can import these sample requests into Postman or run them directly via curl.

Base URL:
- `http://localhost:3000`

### Health
```bash
curl --location "http://localhost:3000/health"
```

### Postgres connection health
```bash
curl --location "http://localhost:3000/api/db/postgres/health"
```

### MySQL schema
```bash
curl --location "http://localhost:3000/api/db/mysql/schema"
```

### MongoDB schema
```bash
curl --location "http://localhost:3000/api/db/mongodb/schema"
```

### S3 files listing
```bash
curl --location "http://localhost:3000/api/s3/files?bucket=<bucket-name>&prefix=<folder>&maxKeys=100"
```

### API ingestion
```bash
curl --location "http://localhost:3000/api/ingest/api" \
--header "Content-Type: application/json" \
--data "{
  \"url\": \"https://jsonplaceholder.typicode.com/posts\",
  \"method\": \"GET\"
}"
```

### Postgres table preview
```bash
curl --location "http://localhost:3000/api/ingest/postgres/table/preview" \
--header "Content-Type: application/json" \
--data "{
  \"tableName\": \"users\",
  \"limit\": 20
}"
```

### Ingestion history
```bash
curl --location "http://localhost:3000/api/history"
```
