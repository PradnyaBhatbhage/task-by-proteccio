# Proteccio Discover - Privacy Governance Backend

Proteccio Discover is a Node.js and Express backend for privacy data discovery, governance, compliance intelligence, risk analysis, remediation tracking, dashboard APIs, RBAC, alerting, and audit-ready reporting.

It covers:

- **Week 1:** Data ingestion from databases, cloud storage, files, and APIs.
- **Week 2:** Discovery, classification, mapping, lineage, profiling, search, dashboard metrics, and audit logs.
- **Week 3:** Privacy risk analysis, compliance intelligence, remediation workflows, RBAC, alerting, reporting, and governance dashboard APIs.

## Features

- Data ingestion from PostgreSQL, MySQL, MongoDB, AWS S3, uploaded files, and external APIs.
- Sensitive data discovery with masked samples and nested object scanning.
- Multi-label classification for personal, sensitive, financial, health, authentication, and confidential data.
- Data mapping, lineage, flow registration, and duplicate sensitive pattern detection.
- Dataset profiling for completeness, nulls, duplicates, anomalies, and sensitive record density.
- Privacy risk scoring with low, medium, high, and critical risk levels.
- Compliance intelligence for GDPR, DPDP Act, HIPAA, CCPA, and ISO 27001 alignment.
- Remediation ticketing with status, severity, assignment, notes, and audit history.
- Governance dashboard APIs and static dashboard UI.
- JWT authentication, RBAC, API key fallback, and route-level permission checks.
- Alerting for critical discoveries, compliance violations, failed scans, high-risk datasets, and overdue remediation.
- Report generation and download in JSON, CSV, and PDF.

## Tech Stack

- Runtime: Node.js 20+
- Language: TypeScript
- Framework: Express
- Validation/config: Zod, dotenv
- Logging: pino, pino-http
- Databases/connectors: pg, mysql2, mongodb
- Cloud SDK: AWS SDK v3
- File parsing: multer, csv-parse, xlsx, pdf-parse
- Reports: pdfkit, CSV/JSON exporters
- Scheduling: node-cron
- Auth: JWT, scrypt password hashing

## Project Structure

```text
src/
  alerting/       Alert triggers, queue, dedupe, email and in-app channels
  auth/           Users, password hashing, JWT, RBAC roles and route policy
  catalog/        Governance dataset catalog
  classification/ Classification rules and labels
  config/         Environment and security config
  connectors/     PostgreSQL, MySQL, MongoDB, S3, API connectors
  discovery/      Sensitive data detection engine
  mapping/        Systems, datasets, fields, flows, lineage
  middleware/     Auth, authorization, rate limiting
  profiling/      Dataset profiling engine
  remediation/    Remediation ticket store and workflow helpers
  reporting/      Report builders, store, queue, exporters
  risk/           Risk scoring, compliance intelligence, aggregation
  routes/         Express API routes
  search/         Dataset, remediation, lineage, global search
  services/       Ingestion, dashboard analytics, normalization, metadata
  utils/          Logging, security helpers, SSRF protection
public/dashboard/ Static governance dashboard UI
openapi/          OpenAPI specification
```

## Prerequisites

- Node.js 20+
- npm
- Optional: PostgreSQL, MySQL, MongoDB, and AWS credentials for connector testing

## Setup

Install dependencies:

```bash
npm install
```

Create environment file:

```powershell
copy .env.example .env
```

For macOS/Linux:

```bash
cp .env.example .env
```

Add JWT settings to `.env` for local RBAC testing:

```env
JWT_SECRET=proteccio_local_jwt_secret_12345
SEED_DEFAULT_USERS=true
```

Start development server:

```bash
npm run dev
```

Default URLs:

- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Swagger docs: `http://localhost:3000/docs`
- Dashboard UI: `http://localhost:3000/dashboard/`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

## Scripts

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run start
npm run docs:generate
```

- `npm run dev` starts the TypeScript development server.
- `npm run typecheck` validates TypeScript.
- `npm test` runs focused Week 3 tests.
- `npm run build` compiles to `dist`.
- `npm run start` starts the compiled server.
- `npm run docs:generate` regenerates OpenAPI and Postman artifacts.

## Authentication

### JWT + RBAC

When `JWT_SECRET` is set, RBAC is enabled. Login first:

```http
POST /api/auth/login
```

Body:

```json
{
  "email": "viewer@local",
  "password": "Viewer1!"
}
```

Use the returned token:

```text
Authorization: Bearer <token>
```

### Demo Users

Demo users are seeded when `SEED_DEFAULT_USERS=true` and `NODE_ENV` is not production.

| Email | Password | Role |
| --- | --- | --- |
| `superadmin@local` | `SuperAdmin1!` | `super_admin` |
| `privacy@local` | `PrivacyAdmin1!` | `privacy_admin` |
| `analyst@local` | `SecurityAnalyst1!` | `security_analyst` |
| `auditor@local` | `Auditor1!` | `auditor` |
| `viewer@local` | `Viewer1!` | `viewer` |

### Role Access

| Role | Access |
| --- | --- |
| Super Admin | Full access, including user management |
| Privacy Admin | Risk, compliance, catalog, remediation, reports, alerts |
| Security Analyst | Ingestion, discovery, classification, mapping, profiling, risk |
| Auditor | Read-only governance access and report generation |
| Viewer | Read-only dashboard, search, audit, remediation list |

### API Key Fallback

If `API_KEY` is set, clients can also send:

```text
X-API-Key: <API_KEY>
```

or:

```text
Authorization: Bearer <API_KEY>
```

JWT is recommended for normal testing.

## Dashboard Usage

Open:

```text
http://localhost:3000/dashboard/
```

Login in the dashboard with:

```text
viewer@local
Viewer1!
```

If the dashboard is empty, register at least one dataset first. The dashboard reads from the in-memory governance catalog, so data is reset when the server restarts.

Main dashboard APIs:

- `GET /api/dashboard/governance`
- `GET /api/dashboard/analytics`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/metrics/risk`
- `GET /api/dashboard/metrics/compliance`
- `GET /api/dashboard/metrics/remediation`
- `GET /api/dashboard/metrics/heatmap`
- `GET /api/dashboard/metrics/exposure`

## Quick API Flow

Recommended testing order:

1. Login: `POST /api/auth/login`
2. Discovery: `POST /api/discovery/scan`
3. Classification: `POST /api/classification/classify`
4. Catalog registration: `POST /api/catalog/register`
5. Risk analysis: `POST /api/risk/analyze`
6. Compliance intelligence: `POST /api/risk/compliance`
7. Dashboard: `GET /api/dashboard/governance`
8. Remediation: `POST /api/remediation`
9. Search: `GET /api/search/datasets`
10. Reports: `POST /api/reports/generate`
11. Alerts: `GET /api/alerts`

## API Documentation

| Artifact | Location |
| --- | --- |
| Swagger UI | `http://localhost:3000/docs` |
| OpenAPI JSON | `openapi/openapi.json` and `GET /openapi.json` |
| Postman Collection | `postman_collection.json` |

Regenerate docs after route/schema changes:

```bash
npm run docs:generate
```

## Core API Areas

### Ingestion

- `POST /api/ingest/api`
- `POST /api/ingest/file/preview`
- `POST /api/ingest/s3/preview`
- `POST /api/ingest/postgres/table/preview`
- `GET /api/history`

Selected ingest endpoints support `"discovery": true` to run discovery on the normalized batch.

### Discovery and Classification

- `POST /api/discovery/scan`
- `GET /api/discovery/categories`
- `POST /api/classification/classify`

Sensitive values are masked in API output. Do not log or report raw sensitive values.

### Mapping and Lineage

- `POST /api/mapping/datasets`
- `POST /api/mapping/from-scan`
- `POST /api/mapping/flows`
- `GET /api/mapping/datasets`
- `GET /api/mapping/systems`
- `GET /api/mapping/fields`
- `GET /api/mapping/flows`
- `GET /api/mapping/lineage/dataset/:datasetId`
- `GET /api/mapping/lineage/field/:fieldId`
- `GET /api/mapping/duplicates`
- `GET /api/mapping/export`

### Profiling and Catalog

- `POST /api/profiling/profile`
- `POST /api/catalog/register`
- `GET /api/catalog/datasets`

`exposureHints.complianceControls` can attest governance controls such as retention policy, consent, privacy notice, access controls, BAA, PHI audit logging, and ISO control posture.

### Privacy Risk Analysis

- `POST /api/risk/analyze`
- `GET /api/risk/high-risk-datasets`
- `GET /api/risk/prioritization`
- `GET /api/risk/aggregation/sources`
- `GET /api/risk/aggregation/systems`

Risk factors:

- Sensitive data volume
- Sensitive data type
- Multiple sensitive attributes together
- Public/API exposure
- Missing encryption indicators
- Duplicate sensitive storage
- Unmapped, unused, or orphaned sensitive data

Risk levels:

- `low`
- `medium`
- `high`
- `critical`

### Compliance Intelligence

- `POST /api/risk/compliance`
- `GET /api/risk/compliance/catalog`
- `GET /api/risk/compliance-exposure`

Supported frameworks:

- GDPR
- DPDP Act
- HIPAA
- CCPA
- ISO 27001 basic alignment

Outputs include compliance status, applicable regulations, missing/violated controls, compliance flags, regulatory exposure, and suggested remediation actions.

### Remediation Workflow

- `POST /api/remediation`
- `GET /api/remediation`
- `GET /api/remediation/:id`
- `PATCH /api/remediation/:id`
- `GET /api/remediation/:id/history`
- `POST /api/remediation/from-prioritization`

Ticket statuses:

- `open`
- `in_progress`
- `resolved`
- `closed`

Severity levels:

- `low`
- `medium`
- `high`
- `critical`

Each ticket includes source, risk type, classification category, suggested action, optional assigned user, resolution notes, timestamps, and history.

### Search and Filtering

- `GET /api/search/datasets`
- `GET /api/search/global`
- `GET /api/search/lineage`
- `GET /api/search/remediation`
- `GET /api/search/mapped-fields`
- `GET /api/search/duplicate-sensitive`

Example queries:

| Goal | Request |
| --- | --- |
| GDPR violations | `GET /api/search/datasets?complianceRegulation=GDPR&complianceViolation=true` |
| Critical risk sources | `GET /api/search/datasets?riskLevel=critical` |
| Unresolved remediation | `GET /api/search/remediation?unresolved=true` |
| Aadhaar + Financial Data | `GET /api/search/datasets?detectionCategories=aadhaar&classifications=Financial%20Data` |
| Global keyword | `GET /api/search/global?q=gdpr` |

### Audit

- `GET /api/audit/logs`

Supports query filters such as `limit`, `action`, `status`, and `sourcePrefix`.

### Reporting

- `GET /api/reports/types`
- `POST /api/reports/generate`
- `GET /api/reports/jobs/:jobId`
- `GET /api/reports`
- `GET /api/reports/:id`
- `GET /api/reports/:id/download`

Supported report types:

- `privacy_risk`
- `compliance`
- `source_discovery`
- `classification_summary`
- `remediation`
- `executive_summary`

Supported export formats:

- `json`
- `csv`
- `pdf`

Download examples:

```http
GET /api/reports/:id/download?format=json
GET /api/reports/:id/download?format=csv
GET /api/reports/:id/download?format=pdf
```

### Alerting

Triggers:

- Critical sensitive data discovery
- Compliance violations
- Failed scans
- High-risk datasets
- Remediation overdue items

APIs:

- `GET /api/alerts`
- `GET /api/alerts/stats`
- `GET /api/alerts/notifications`
- `PATCH /api/alerts/notifications/:id/read`
- `POST /api/alerts/notifications/read-all`
- `GET /api/alerts/email-outbox`
- `POST /api/alerts/evaluate-overdue`

Channels:

- Email outbox / webhook when configured
- In-app notifications

When email is not configured and in-app notifications are enabled, default alerts are delivered in-app without retrying a missing email channel.

## Sample Dataset Registration

Use this to populate dashboard data quickly after login with `privacy@local`.

```http
POST /api/catalog/register
```

Body:

```json
{
  "discovery": {
    "trace": {
      "sourceType": "database",
      "sourceName": "demo-db",
      "entityName": "customers"
    },
    "scannedRecords": 2,
    "findingsPerRecord": [
      {
        "recordIndex": 0,
        "findings": [
          {
            "category": "aadhaar",
            "methods": ["regex", "rule_validation"],
            "path": "root.aadhaar",
            "confidence": "high",
            "maskedSample": "XXXX-XXXX-1234",
            "valueLength": 12
          },
          {
            "category": "email",
            "methods": ["regex"],
            "path": "root.email",
            "confidence": "high",
            "maskedSample": "u***@example.com"
          }
        ]
      },
      {
        "recordIndex": 1,
        "findings": [
          {
            "category": "payment_card",
            "methods": ["regex", "rule_validation"],
            "path": "root.card",
            "confidence": "high",
            "maskedSample": "**** **** **** 1111"
          }
        ]
      }
    ],
    "summary": {
      "aadhaar": 1,
      "email": 1,
      "payment_card": 1
    }
  },
  "classification": {
    "trace": {
      "sourceType": "database",
      "sourceName": "demo-db",
      "entityName": "customers"
    },
    "scannedRecords": 2,
    "assignmentsPerRecord": [],
    "summary": {
      "Personal Data": 1,
      "Sensitive Personal Data": 1,
      "Financial Data": 1
    }
  },
  "exposureHints": {
    "isPubliclyExposed": true,
    "encryptionIndicated": false,
    "complianceControls": {
      "retentionPolicyIndicated": false,
      "accessControlsIndicated": false
    }
  }
}
```

After registering, refresh:

```text
http://localhost:3000/dashboard/
```

## Security Notes

- Store secrets in `.env`; do not hardcode them in source.
- Use JWT authentication for protected APIs.
- Passwords are hashed with scrypt.
- API logs redact authorization headers and avoid raw sensitive values.
- Discovery outputs use masked samples.
- Input payloads are validated with Zod.
- Rate limiting is applied to login, reports, and API routes.
- API ingestion includes SSRF protections.
- Reports use structured data and must not expose raw sensitive values.

## Performance Notes

| Capability | Implementation |
| --- | --- |
| Large datasets | Request caps and batched discovery |
| Reporting | Shared dashboard analytics pass, bounded report sections |
| Async processing | Report queue and alert queue |
| API bottlenecks | Rate limits, async report jobs, JSON size limit |
| Indexing | In-memory secondary indexes for catalog, remediation, reports |
| Dashboard | Cached analytics invalidated on catalog/remediation writes |

Useful environment variables:

- `DASHBOARD_CACHE_TTL_MS`
- `ASYNC_REPORT_THRESHOLD_DATASETS`
- `REPORT_QUEUE_POLL_MS`
- `REPORT_MAX_COMPLIANCE_ROWS`
- `REPORT_MAX_REMEDIATION_TICKETS`
- `ALERT_DEDUPE_TTL_HOURS`
- `ALERT_REMEDIATION_OVERDUE_DAYS`

## Verification

Run before final submission:

```bash
npm run typecheck
npm test
npm run build
npm run docs:generate
```

Expected:

- TypeScript passes.
- Tests pass.
- Build completes.
- OpenAPI and Postman artifacts regenerate successfully.

## Deployment Notes

The repository includes Vercel-compatible setup. For final submission, include:

- Live deployed Vercel application link
- GitHub repository link
- Demo login credentials
- README documentation
- API documentation link
- Demo walkthrough video

Important production note:

This repository version uses in-memory stores for catalog, mapping, audit, remediation, reports, alerts, and users. For multi-instance production deployment, back these stores with PostgreSQL or MongoDB using the existing service/store boundaries.

## Known Local Testing Tips

- If `/api/auth/login` says RBAC is disabled, set `JWT_SECRET` in `.env` and restart the server.
- If `/api/auth/me` or dashboard APIs return unauthorized, login first and send `Authorization: Bearer <token>`.
- If the browser dashboard is empty, register a dataset first with `POST /api/catalog/register`.
- If data disappears after restart, that is expected for the current in-memory MVP store.
- If Postman uses `{{baseUrl}}`, set it to `http://localhost:3000`.
