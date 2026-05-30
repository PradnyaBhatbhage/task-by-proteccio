# Proteccio Discover - Privacy Governance Backend

Proteccio Discover is a Node.js and Express backend for privacy data discovery, governance, compliance intelligence, risk analysis, remediation tracking, dashboard APIs, RBAC, alerting, and audit-ready reporting.

It covers:

- **Week 1:** Data ingestion from databases, cloud storage, files, and APIs.
- **Week 2:** Discovery, classification, mapping, lineage, profiling, search, dashboard metrics, and audit logs.
- **Week 3:** Privacy risk analysis, compliance intelligence, remediation workflows, RBAC, alerting, reporting, and governance dashboard APIs.
- **Week 4:** Integrated product prototype with source onboarding, Supabase-ready persistence, live dashboards, frontend workflows, and deployment readiness.

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
- Week 4 frontend workflow shell for auth, source management, discovery, mapping, profiling, governance, search, reporting, and real-time dashboard updates.
- Optional Supabase REST persistence for source registry and platform events.

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
frontend/         Next.js + React + Tailwind frontend application
openapi/          OpenAPI specification
supabase/         SQL schema for Week 4 Supabase tables and realtime events
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

If `JWT_SECRET` is omitted in development, the server uses the same demo-only local secret so the dashboard login works immediately. Production still fails fast unless real Supabase Auth, `JWT_SECRET`, or `API_KEY` settings are provided.

Week 4 Supabase setup:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Add these values to `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PROFILE_TABLE=proteccio_profiles
SUPABASE_SOURCE_TABLE=proteccio_sources
SUPABASE_DISCOVERY_TABLE=proteccio_discovery_runs
SUPABASE_FILE_TABLE=proteccio_uploaded_files
SUPABASE_CATALOG_TABLE=proteccio_catalog_snapshots
SUPABASE_MAPPING_TABLE=proteccio_mapping_inventory
SUPABASE_REMEDIATION_TABLE=proteccio_remediation_tickets
SUPABASE_REPORT_TABLE=proteccio_reports
SUPABASE_AUDIT_TABLE=proteccio_audit_logs
SUPABASE_ALERT_TABLE=proteccio_alerts
SUPABASE_NOTIFICATION_TABLE=proteccio_notifications
SUPABASE_WORKFLOW_TABLE=proteccio_workflow_runs
SUPABASE_EVENT_TABLE=proteccio_events
SUPABASE_STORAGE_BUCKET=proteccio-uploads
SUPABASE_REQUIRED=false
```

Set `SUPABASE_REQUIRED=true` in production when the deployment must fail fast without Supabase credentials.

Production security requirements:

- Set `NODE_ENV=production`, `SUPABASE_REQUIRED=true`, and `ENFORCE_HTTPS=true`.
- Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; never expose service-role keys to the browser.
- Set `SEED_DEFAULT_USERS=false` and create real users through Supabase/Auth user management.
- Keep `JWT_SECRET`, `API_KEY`, database passwords, AWS keys, and Supabase keys only in environment variables or a secrets manager.
- Keep upload size aligned with `UPLOAD_MAX_FILE_SIZE_BYTES` and the private Supabase Storage bucket limit.
- Run `supabase/schema.sql` so RLS and private storage policies are enabled before exposing the prototype.

Performance notes:

- Dashboard aggregates use a TTL cache controlled by `DASHBOARD_CACHE_TTL_MS`.
- The dashboard client caches low-churn support calls such as platform status, sources, lineage preview, and report history.
- Live dashboard events skip expensive chart/table re-renders when the aggregate payload has not changed.
- Large result surfaces use pagination (`page`, `pageSize`, and cursor support where available).
- `supabase/schema.sql` includes indexes for common source, discovery, event, upload, and JSON summary query paths.

The Week 4 backend uses Supabase as the central platform when these values are configured:

- **Supabase Auth:** `/api/auth/signup`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/me`, and admin user management use Supabase users and profile roles.
- **Session handling:** `/api/auth/refresh` refreshes Supabase sessions and `/api/auth/logout` revokes Supabase sessions when possible; the frontend stores tokens in browser local storage for the prototype and clears them on logout.
- **Supabase PostgreSQL:** source registry rows, discovery/classification runs, catalog snapshots, mapping inventory, remediation tickets, reports, audit logs, alerts, workflow runs, file metadata, user profiles, and platform events are stored in Supabase tables.
- **Supabase Storage:** uploaded files are written to the private `proteccio-uploads` bucket and linked through `proteccio_uploaded_files`.
- **Supabase APIs:** the Express backend uses the Supabase SDK with service-role credentials for server-side writes and validates Supabase bearer tokens for API access.
- **RLS:** `supabase/schema.sql` enables row-level security and role-aware policies for viewers, auditors, analysts, privacy admins, and super admins across application, governance, alerting, reporting, and storage tables.

The frontend uses the permissions returned at login to protect routes and render role-appropriate navigation. Viewers and auditors see read-only analytics/search/reporting surfaces, while security analysts, privacy admins, and super admins can run write workflows according to their role grants.

To exercise the complete prototype flow in one call, use:

```http
POST /api/workflow/run
```

This endpoint runs normalization, discovery, classification, mapping, profiling/catalog registration, risk analysis, compliance intelligence, remediation ticket creation, executive reporting, and dashboard refresh for the supplied record batch.

Start development server:

```bash
npm run dev
```

Start the modern React frontend in a second terminal:

```bash
npm run frontend:dev
```

The Next.js app runs at `http://localhost:3001` and calls the backend at `http://localhost:3000` by default. To point it at a deployed backend, set:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend.example.com
```

If you change the frontend origin, also update backend CORS:

```env
CORS_ALLOWED_ORIGINS=http://localhost:3001,https://your-frontend.example.com
```

Default URLs:

- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Swagger docs: `http://localhost:3000/docs`
- Dashboard UI: `http://localhost:3000/dashboard/`
- Modern React frontend: `http://localhost:3001`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

## Scripts

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run frontend:build
npm run start
npm run docs:generate
```

- `npm run dev` starts the TypeScript development server.
- `npm run typecheck` validates TypeScript.
- `npm test` runs focused Week 3 tests.
- `npm run build` compiles to `dist`.
- `npm run frontend:dev` starts the Next.js React frontend.
- `npm run frontend:build` creates the production frontend build.
- `npm run frontend:typecheck` validates the frontend TypeScript app.
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

### Modern React Frontend

The Week 4 frontend application lives in `frontend/` and uses Next.js, React, Tailwind CSS, and shadcn-style reusable primitives. It includes:

- `/login` for login, signup, and password reset initiation.
- `/dashboard` for executive KPIs, risk distribution, and compliance indicators.
- `/sources` for source onboarding, database/API/S3/file configuration, and status monitoring.
- `/discovery` for record exploration and the complete discovery-to-reporting workflow.
- `/mapping` for mapping inventory, source risk heatmap, data flows, and lineage field rows.
- `/compliance` for a dedicated Compliance Overview Dashboard covering GDPR, DPDP, HIPAA, CCPA, ISO 27001 exposure, controls, and source-level compliance risk.
- `/governance` for profiling statistics, compliance indicators, remediation actions, and exposed systems.
- `/search` for advanced dataset/remediation/global filtering with pagination and sorting.
- `/reports` for report generation, report history, and JSON/CSV/PDF downloads.
- `/users` for Super Admin user creation and RBAC role management.
- Shared sidebar navigation, glass-card layout, responsive grid surfaces, and reusable `Button`, `Card`, `Input`, `Select`, `Textarea`, and `Badge` components.

Run it with:

```bash
npm run frontend:dev
```

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

## Deployment

Deploy the backend from the repository root using `vercel.json`; it serves the Express API through `api/index.js` after `npm run build`.

Deploy the frontend as a separate Vercel project with root directory `frontend/`. Set `NEXT_PUBLIC_API_BASE_URL` to the deployed backend URL and add the same frontend URL to backend `CORS_ALLOWED_ORIGINS`.



Important production note:

The API keeps hot in-memory indexes for fast prototype reads, and writes governance records through to Supabase when configured. For a multi-instance production cluster, make Supabase/PostgreSQL the read source for catalog, mapping, audit, remediation, reports, alerts, and workflow history, or add a shared cache so every instance observes the same state.

### Final Submission Checklist

- Deploy the dashboard/API and set `NODE_ENV=production`, `SUPABASE_REQUIRED=true`, `ENFORCE_HTTPS=true`, `SEED_DEFAULT_USERS=false`, and real Supabase/JWT/API secrets in the host environment.
- Run `supabase/schema.sql` in the Supabase SQL editor and verify the private `proteccio-uploads` bucket plus RLS policies are enabled.
- Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run docs:generate`.
- Include the live Vercel/frontend URL, backend URL, Supabase project-connected demo credentials, GitHub repository URL, Swagger/OpenAPI URL, database schema location (`supabase/schema.sql`), and demo walkthrough video link in the submission notes.
- Use a super admin to create evaluator accounts through the dashboard User & Role Management panel or `/api/auth/users`.

## Known Local Testing Tips

- If `/api/auth/login` says RBAC is disabled, set `JWT_SECRET` in `.env` and restart the server.
- If `/api/auth/me` or dashboard APIs return unauthorized, login first and send `Authorization: Bearer <token>`.
- If the browser dashboard is empty, register a dataset first with `POST /api/catalog/register`.
- If data disappears after restart, that is expected for the current in-memory MVP store.
- If Postman uses `{{baseUrl}}`, set it to `http://localhost:3000`.
