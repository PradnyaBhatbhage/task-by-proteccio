import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const openapiDir = path.join(root, "openapi");
fs.mkdirSync(openapiDir, { recursive: true });

const tags = [
  { name: "Health", description: "Liveness probe (no API key)." },
  { name: "Auth", description: "JWT login, current principal, roles, and user administration (RBAC)." },
  { name: "Platform", description: "Week 4 Supabase/platform readiness status." },
  { name: "Sources", description: "Source onboarding, configuration, and status monitoring." },
  { name: "Workflow", description: "End-to-end Week 4 data flow orchestration." },
  { name: "Realtime", description: "Live dashboard update stream." },
  { name: "Ingestion", description: "Connectors, upload, ingest previews/full, history." },
  { name: "Discovery", description: "Sensitive-data discovery scans." },
  { name: "Classification", description: "Privacy labels from discovery results." },
  { name: "Mapping", description: "Systems, datasets, fields, flows, lineage, export." },
  { name: "Profiling", description: "Profiling reports and governance catalog." },
  { name: "Risk", description: "Week 3 privacy risk analysis engine." },
  { name: "Remediation", description: "Remediation workflow tickets, status, severity, and audit history." },
  { name: "Search", description: "Search datasets, mapped fields, duplicate-sensitive groups." },
  { name: "Dashboard", description: "Aggregated metrics for the UI." },
  { name: "Audit", description: "Structured audit trail." },
  { name: "Reporting", description: "Audit-ready governance reports (PDF, CSV, JSON) with searchable history." },
  { name: "Alerts", description: "Queue-based alerting with deduplication, email, and in-app notifications." }
];

const security = [{ bearerAuth: [] }, { apiKeyHeader: [] }];

const components = {
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      description: "JWT from POST /api/auth/login when JWT_SECRET is set; otherwise API_KEY value."
    },
    apiKeyHeader: { type: "apiKey", in: "header", name: "X-API-Key", description: "Same value as API_KEY when set." }
  },
  schemas: {
    HealthOk: {
      type: "object",
      properties: { ok: { type: "boolean", example: true } },
      required: ["ok"]
    },
    ErrorBody: {
      type: "object",
      properties: { error: { type: "string", example: "Unauthorized" } },
      required: ["error"]
    },
    IngestionJob: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        sourceType: { type: "string", enum: ["database", "cloud", "file", "api"] },
        sourceName: { type: "string" },
        status: { type: "string", enum: ["success", "failed", "partial"] },
        attempts: { type: "integer" },
        message: { type: "string" },
        startedAt: { type: "string", format: "date-time" },
        endedAt: { type: "string", format: "date-time" }
      }
    },
    SourceMetadata: {
      type: "object",
      additionalProperties: true,
      properties: {
        sourceName: { type: "string" },
        sourceType: { type: "string" },
        entityName: { type: "string" },
        recordCount: { type: "integer" }
      }
    },
    IngestApiRequest: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", example: "https://jsonplaceholder.typicode.com/posts" },
        method: { type: "string", example: "GET" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: {},
        pagination: { type: "object" },
        schemaMapping: { type: "object", additionalProperties: { type: "string" } },
        discovery: { type: "boolean", description: "If true, attach discovery scan on normalized batch." }
      }
    },
    IngestApiResponse: {
      type: "object",
      properties: {
        recordCount: { type: "integer", example: 100 },
        metadata: { $ref: "#/components/schemas/SourceMetadata" },
        sample: { type: "array", items: { type: "object", additionalProperties: true } },
        discovery: { type: "object", description: "Present when discovery: true" }
      }
    },
    DiscoveryScanRequest: {
      type: "object",
      required: ["records"],
      properties: {
        records: {
          type: "array",
          items: { type: "object", additionalProperties: true },
          example: [{ user: { email: "a@b.com", id: 1 } }]
        },
        sourceType: { type: "string", enum: ["database", "cloud", "file", "api"] },
        sourceName: { type: "string" },
        entityName: { type: "string" },
        classify: { type: "boolean" },
        batchSize: { type: "integer", minimum: 1 },
        maxDepth: { type: "integer" },
        maxLeavesPerRecord: { type: "integer" }
      }
    },
    ClassificationRequest: {
      type: "object",
      required: ["discovery"],
      properties: {
        discovery: { type: "object", description: "DiscoveryScanResult from POST /api/discovery/scan" }
      }
    },
    MappingFromScanRequest: {
      type: "object",
      properties: {
        discovery: { type: "object", description: "DiscoveryScanResult" },
        classification: { type: "object", description: "Optional ClassificationScanResult" }
      }
    },
    ProfilingRequest: {
      type: "object",
      required: ["discovery"],
      properties: {
        discovery: { type: "object" },
        classification: { type: "object" },
        records: { type: "array", items: { type: "object" } },
        persist: { type: "boolean" },
        profilingOptions: { type: "object" },
        exposureHints: { $ref: "#/components/schemas/ExposureHints" }
      }
    },
    ComplianceControlHints: {
      type: "object",
      description: "Governance control attestations used by the compliance intelligence engine.",
      properties: {
        retentionPolicyIndicated: { type: "boolean" },
        consentManagementIndicated: { type: "boolean" },
        privacyNoticeIndicated: { type: "boolean" },
        lawfulBasisDocumented: { type: "boolean" },
        accessControlsIndicated: { type: "boolean" },
        breachNotificationProcessIndicated: { type: "boolean" },
        dataPrincipalRightsProcessIndicated: { type: "boolean" },
        baaInPlace: { type: "boolean" },
        phiAuditLoggingIndicated: { type: "boolean" },
        optOutMechanismIndicated: { type: "boolean" },
        ismsRiskAssessmentIndicated: { type: "boolean" },
        purposeLimitationDocumented: { type: "boolean" },
        crossBorderSafeguardsIndicated: { type: "boolean" },
        consumerDisclosureIndicated: { type: "boolean" },
        ismsDocumented: { type: "boolean" }
      }
    },
    ExposureHints: {
      type: "object",
      properties: {
        hasApiExposureFlow: { type: "boolean" },
        hasReplicationOrBackupFlow: { type: "boolean" },
        isPubliclyExposed: { type: "boolean" },
        encryptionIndicated: { type: "boolean" },
        crossDatasetDuplicateGroupCount: { type: "integer", minimum: 0 },
        unmappedDataset: { type: "boolean" },
        noLineageFlows: { type: "boolean" },
        daysSinceLastActivity: { type: "integer", minimum: 0 },
        complianceControls: { $ref: "#/components/schemas/ComplianceControlHints" }
      }
    },
    RiskAnalyzeRequest: {
      type: "object",
      required: ["discovery"],
      properties: {
        discovery: { type: "object", description: "DiscoveryScanResult" },
        classification: { type: "object", description: "Optional ClassificationScanResult" },
        records: { type: "array", items: { type: "object", additionalProperties: true } },
        exposureHints: { $ref: "#/components/schemas/ExposureHints" },
        weights: {
          type: "object",
          additionalProperties: { type: "number", minimum: 0, maximum: 1 },
          description: "Optional risk factor weight overrides."
        },
        profilingOptions: { type: "object" }
      },
      example: {
        discovery: { trace: { sourceType: "database", sourceName: "prod", entityName: "customers" }, scannedRecords: 1, findingsPerRecord: [], summary: { aadhaar: 1 } },
        exposureHints: {
          encryptionIndicated: false,
          isPubliclyExposed: true,
          complianceControls: { retentionPolicyIndicated: false, accessControlsIndicated: false }
        }
      }
    },
    RiskAnalyzeResponse: {
      type: "object",
      properties: {
        analysis: { type: "object" },
        assessment: { type: "object" },
        profile: { type: "object" }
      }
    },
    ComplianceIntelligenceRequest: {
      type: "object",
      required: ["discovery"],
      properties: {
        discovery: { type: "object" },
        classification: { type: "object" },
        exposureHints: { $ref: "#/components/schemas/ExposureHints" },
        factorContributions: { type: "array", items: { type: "object" } }
      }
    },
    ComplianceIntelligenceResponse: {
      type: "object",
      properties: {
        compliance: { type: "object" },
        regulations: { type: "array", items: { type: "string", enum: ["GDPR", "DPDP", "HIPAA", "CCPA", "ISO27001"] } },
        controls: { type: "array", items: { type: "object" } },
        flags: { type: "array", items: { type: "object" } },
        remediationActions: { type: "array", items: { type: "string" } }
      }
    },
    RemediationTicket: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        source: { type: "string" },
        riskType: { type: "string" },
        classificationCategory: { type: "string" },
        suggestedAction: { type: "string" },
        assignedUser: { type: "string" },
        resolutionNotes: { type: "string" },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] },
        datasetId: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        history: { type: "array", items: { type: "object" } }
      }
    },
    RemediationListResponse: {
      type: "object",
      properties: {
        items: { type: "array", items: { $ref: "#/components/schemas/RemediationTicket" } },
        total: { type: "integer" },
        page: { type: "integer" },
        pageSize: { type: "integer" }
      }
    },
    ReportRecord: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        reportType: { type: "string" },
        title: { type: "string" },
        generatedAt: { type: "string", format: "date-time" },
        primaryFormat: { type: "string", enum: ["json", "csv", "pdf"] },
        summary: { type: "string" },
        generatedBy: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      }
    },
    AlertEvent: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        type: { type: "string", enum: ["critical_sensitive_discovery", "compliance_violation", "failed_scan", "high_risk_dataset", "remediation_overdue"] },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        title: { type: "string" },
        message: { type: "string" },
        subjectKey: { type: "string" },
        datasetId: { type: "string" },
        status: { type: "string", enum: ["pending", "queued", "delivered", "suppressed", "failed"] },
        channels: { type: "array", items: { type: "string", enum: ["email", "in_app"] } },
        createdAt: { type: "string", format: "date-time" }
      }
    }
  },
  parameters: {
    datasetId: { name: "datasetId", in: "path", required: true, schema: { type: "string" } },
    fieldId: { name: "fieldId", in: "path", required: true, schema: { type: "string" } }
  }
};

function op(
  tag,
  summary,
  extra = {}
) {
  return {
    tags: [tag],
    summary,
    ...extra
  };
}

function jsonResp(description, schemaRef = "#/components/schemas/ErrorBody", example = undefined) {
  const content = {
    "application/json": {
      schema: schemaRef ? { $ref: schemaRef } : { type: "object", additionalProperties: true }
    }
  };
  if (example !== undefined) {
    content["application/json"].example = example;
  }
  return { description, content };
}

const paths = {
  "/health": {
    get: {
      ...op("Health", "Service health check"),
      security: [],
      responses: {
        "200": jsonResp("OK", "#/components/schemas/HealthOk", { ok: true })
      }
    }
  },
  "/api/auth/login": {
    post: {
      ...op("Auth", "Login and receive JWT access token"),
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", example: "superadmin@discover.app" },
                password: { type: "string", example: "SuperAdmin1!" }
              }
            }
          }
        }
      },
      responses: {
        "200": { description: "Token issued", content: { "application/json": { schema: { type: "object" } } } },
        "401": jsonResp("Invalid credentials", "#/components/schemas/ErrorBody")
      }
    }
  },
  "/api/auth/signup": {
    post: {
      ...op("Auth", "Self-service signup; new users start as viewers"),
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password", "displayName"],
              properties: {
                email: { type: "string", example: "new.user@example.com" },
                password: { type: "string", example: "Viewer123!" },
                displayName: { type: "string", example: "New User" }
              }
            }
          }
        }
      },
      responses: { "201": { description: "Created and signed in", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/auth/forgot-password": {
    post: {
      ...op("Auth", "Start password reset workflow"),
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["email"], properties: { email: { type: "string" } } }
          }
        }
      },
      responses: { "202": { description: "Accepted", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/auth/refresh": {
    post: {
      ...op("Auth", "Refresh Supabase session"),
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } }
          }
        }
      },
      responses: { "200": { description: "Refreshed session", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/auth/logout": {
    post: {
      ...op("Auth", "Logout and revoke Supabase session when available"),
      responses: { "200": { description: "Logged out", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/auth/me": {
    get: {
      ...op("Auth", "Current authenticated principal and permissions"),
      responses: { "200": { description: "Principal", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/auth/roles": {
    get: {
      ...op("Auth", "List roles and permission sets"),
      responses: { "200": { description: "Roles", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/auth/users": {
    get: {
      ...op("Auth", "List users (Super Admin)"),
      responses: { "200": { description: "Users", content: { "application/json": { schema: { type: "object" } } } } }
    },
    post: {
      ...op("Auth", "Create user (Super Admin)"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password", "displayName", "role"],
              properties: {
                email: { type: "string" },
                password: { type: "string" },
                displayName: { type: "string" },
                role: {
                  type: "string",
                  enum: ["super_admin", "privacy_admin", "security_analyst", "auditor", "viewer"]
                }
              }
            }
          }
        }
      },
      responses: { "201": { description: "Created", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/platform/status": {
    get: {
      ...op("Platform", "Supabase/platform configuration and readiness"),
      responses: { "200": { description: "Platform status", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/sources": {
    get: {
      ...op("Sources", "List managed sources"),
      responses: { "200": { description: "Sources", content: { "application/json": { schema: { type: "object" } } } } }
    },
    post: {
      ...op("Sources", "Register a source"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "type"],
              properties: {
                name: { type: "string", example: "customer-production-db" },
                type: { type: "string", enum: ["postgres", "mysql", "mongodb", "api", "s3", "file"] },
                owner: { type: "string" },
                environment: { type: "string", enum: ["development", "staging", "production", "sandbox"] },
                connection: { type: "object", additionalProperties: true },
                tags: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      },
      responses: { "201": { description: "Created", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/sources/{id}": {
    patch: {
      ...op("Sources", "Update source configuration or status"),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
      responses: { "200": { description: "Updated", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/sources/{id}/check": {
    post: {
      ...op("Sources", "Record source connectivity check result"),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      requestBody: { content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
      responses: { "200": { description: "Checked", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/workflow/run": {
    post: {
      ...op("Workflow", "Run ingestion to reporting end-to-end workflow"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["records"],
              properties: {
                records: { type: "array", items: { type: "object", additionalProperties: true } },
                sourceType: { type: "string", enum: ["database", "cloud", "file", "api"] },
                sourceName: { type: "string" },
                entityName: { type: "string" },
                createRemediation: { type: "boolean" },
                reportFormat: { type: "string", enum: ["json", "csv", "pdf"] }
              }
            }
          }
        }
      },
      responses: { "201": { description: "Workflow result", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/realtime/dashboard": {
    get: {
      ...op("Realtime", "Server-sent live dashboard updates"),
      responses: { "200": { description: "text/event-stream dashboard events" } }
    }
  },
  "/api/db/postgres/health": {
    get: {
      ...op("Ingestion", "Postgres connectivity"),
      responses: {
        "200": { description: "ok flag", content: { "application/json": { schema: { type: "object" } } } }
      }
    }
  },
  "/api/db/postgres/schema": {
    get: {
      ...op("Ingestion", "List Postgres tables and columns"),
      responses: { "200": { description: "Schema tree", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/db/mysql/health": {
    get: { ...op("Ingestion", "MySQL connectivity"), responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/db/mysql/schema": {
    get: { ...op("Ingestion", "MySQL schema"), responses: { "200": { description: "Schema", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/db/mongodb/health": {
    get: { ...op("Ingestion", "MongoDB connectivity"), responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/db/mongodb/schema": {
    get: { ...op("Ingestion", "MongoDB collections + fields"), responses: { "200": { description: "Schema", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/s3/buckets": {
    get: { ...op("Ingestion", "List S3 buckets"), responses: { "200": { description: "Buckets", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/s3/files": {
    get: {
      ...op("Ingestion", "List objects in bucket"),
      parameters: [
        { name: "bucket", in: "query", required: true, schema: { type: "string" } },
        { name: "prefix", in: "query", schema: { type: "string" } },
        { name: "maxKeys", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": { description: "Object listing", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/s3/object/metadata": {
    get: {
      ...op("Ingestion", "Head object metadata"),
      parameters: [
        { name: "bucket", in: "query", required: true, schema: { type: "string" } },
        { name: "key", in: "query", required: true, schema: { type: "string" } }
      ],
      responses: { "200": { description: "Metadata", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/upload": {
    post: {
      ...op("Ingestion", "Multipart file upload"),
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: { file: { type: "string", format: "binary" } }
            }
          }
        }
      },
      responses: {
        "201": {
          description: "Stored file id + metadata",
          content: {
            "application/json": {
              example: { fileId: "uuid-filename.csv", metadata: { sourceType: "file", entityName: "data.csv" } }
            }
          }
        },
        "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } }
      }
    }
  },
  "/api/ingest/api": {
    post: {
      ...op("Ingestion", "Ingest from HTTP API"),
      requestBody: {
        content: { "application/json": { schema: { $ref: "#/components/schemas/IngestApiRequest" } } }
      },
      responses: {
        "200": {
          description: "Normalized sample + metadata (+ optional discovery)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/IngestApiResponse" } } }
        },
        "500": { description: "Job failed", content: { "application/json": { schema: { $ref: "#/components/schemas/IngestionJob" } } } }
      }
    }
  },
  "/api/ingest/file/preview": {
    post: {
      ...op("Ingestion", "Upload file and return preview rows"),
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: {
                file: { type: "string", format: "binary" },
                maxRecords: { type: "string", description: "Form field as string number" },
                schemaMapping: { type: "string", description: "JSON string of field map" },
                discovery: { type: "string", enum: ["true", "false"] }
              }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "preview, parser, warnings, metadata",
          content: {
            "application/json": {
              example: {
                fileId: "abc.csv",
                parser: "csv",
                warnings: [],
                metadata: { sourceType: "file", entityName: "sample.csv", recordCount: 10 },
                preview: [{ col1: "x" }]
              }
            }
          }
        }
      }
    }
  },
  "/api/ingest/s3/preview": {
    post: {
      ...op("Ingestion", "Preview S3 object as records"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["bucket", "key"],
              properties: {
                bucket: { type: "string" },
                key: { type: "string" },
                maxRecords: { type: "integer" },
                schemaMapping: { type: "object" },
                discovery: { type: "boolean" }
              }
            }
          }
        }
      },
      responses: { "200": { description: "parser, recordCount, metadata, sample", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/ingest/postgres/table/preview": {
    post: {
      ...op("Ingestion", "Preview Postgres table"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["tableName"],
              properties: {
                tableName: { type: "string", example: "users" },
                schemaName: { type: "string" },
                limit: { type: "integer", default: 50 },
                schemaMapping: { type: "object" },
                discovery: { type: "boolean" }
              },
              example: { tableName: "users", limit: 20 }
            }
          }
        }
      },
      responses: {
        "200": {
          description: "preview + metadata (+ optional discovery)",
          content: {
            "application/json": {
              example: {
                preview: [{ id: 1, email: "masked@example.com" }],
                metadata: { sourceType: "database", entityName: "users", recordCount: 20 }
              }
            }
          }
        }
      }
    }
  },
  "/api/ingest/postgres/table/full": {
    post: {
      ...op("Ingestion", "Full batched Postgres table ingest"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["tableName"],
              properties: {
                tableName: { type: "string" },
                schemaName: { type: "string" },
                batchSize: { type: "integer", default: 1000 },
                maxRecords: { type: "integer" },
                schemaMapping: { type: "object" }
              }
            }
          }
        }
      },
      responses: { "200": { description: "Batch progress summary", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/ingest/mysql/table/preview": {
    post: {
      ...op("Ingestion", "Preview MySQL table"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["tableName"],
              properties: { tableName: { type: "string" }, limit: { type: "integer" }, schemaMapping: { type: "object" } }
            }
          }
        }
      },
      responses: { "200": { description: "preview + metadata", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/ingest/mysql/table/full": {
    post: {
      ...op("Ingestion", "Full MySQL ingest"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["tableName"],
              properties: { tableName: { type: "string" }, batchSize: { type: "integer" }, maxRecords: { type: "integer" } }
            }
          }
        }
      },
      responses: { "200": { description: "Summary", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/ingest/mongodb/collection/preview": {
    post: {
      ...op("Ingestion", "Preview MongoDB collection"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["collectionName"],
              properties: { collectionName: { type: "string" }, limit: { type: "integer" }, schemaMapping: { type: "object" } }
            }
          }
        }
      },
      responses: { "200": { description: "preview", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/ingest/mongodb/collection/full": {
    post: {
      ...op("Ingestion", "Full Mongo collection ingest"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["collectionName"],
              properties: { collectionName: { type: "string" }, batchSize: { type: "integer" }, maxRecords: { type: "integer" } }
            }
          }
        }
      },
      responses: { "200": { description: "Summary", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/ingest/s3/ingest": {
    post: {
      ...op("Ingestion", "Ingest full S3 object"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["bucket", "key"],
              properties: { bucket: { type: "string" }, key: { type: "string" }, batchSize: { type: "integer" }, maxRecords: { type: "integer" } }
            }
          }
        }
      },
      responses: { "200": { description: "Ingest result", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/history": {
    get: {
      ...op("Ingestion", "Recent ingestion jobs"),
      responses: {
        "200": {
          description: "Array of jobs",
          content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/IngestionJob" } } } }
        }
      }
    }
  },
  "/api/discovery/scan": {
    post: {
      ...op("Discovery", "Run discovery on record batch"),
      requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/DiscoveryScanRequest" } } } },
      responses: {
        "200": {
          description: "DiscoveryScanResult (+ optional classification)",
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
              example: {
                scannedRecords: 1,
                findingsPerRecord: [],
                summary: {},
                trace: { sourceType: "file", sourceName: "demo", entityName: "batch-1" }
              }
            }
          }
        },
        "400": { description: "Invalid body", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } }
      }
    }
  },
  "/api/discovery/categories": {
    get: {
      ...op("Discovery", "Supported sensitive categories"),
      responses: {
        "200": {
          description: "category list",
          content: {
            "application/json": {
              example: {
                categories: [
                  "email",
                  "phone",
                  "aadhaar",
                  "pan",
                  "passport",
                  "ip_address",
                  "payment_card",
                  "bank_account",
                  "person_name",
                  "address",
                  "date_of_birth",
                  "authentication_field"
                ]
              }
            }
          }
        }
      }
    }
  },
  "/api/classification/classify": {
    post: {
      ...op("Classification", "Classify from discovery result"),
      requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/ClassificationRequest" } } } },
      responses: {
        "200": {
          description: "ClassificationScanResult",
          content: {
            "application/json": {
              example: { scannedRecords: 1, assignmentsPerRecord: [], summary: {} }
            }
          }
        }
      }
    }
  },
  "/api/mapping/datasets": {
    post: {
      ...op("Mapping", "Register dataset manually"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                sourceType: { type: "string" },
                sourceName: { type: "string" },
                entityName: { type: "string" }
              },
              example: { sourceType: "database", sourceName: "prod-pg", entityName: "public.users" }
            }
          }
        }
      },
      responses: {
        "201": {
          description: "system + dataset",
          content: {
            "application/json": {
              example: {
                system: { id: "sys-...", sourceType: "database", sourceName: "prod-pg" },
                dataset: { id: "ds-...", systemId: "sys-...", entityName: "public.users" }
              }
            }
          }
        }
      }
    }
  },
  "/api/mapping/from-scan": {
    post: {
      ...op("Mapping", "Materialize mapping from discovery (+ optional classification)"),
      requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/MappingFromScanRequest" } } } },
      responses: {
        "201": {
          description: "system, dataset, fields",
          content: { "application/json": { schema: { type: "object", additionalProperties: true } } }
        },
        "400": { description: "Invalid discovery", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } }
      }
    }
  },
  "/api/mapping/flows": {
    post: {
      ...op("Mapping", "Declare data flow between datasets"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["fromDatasetId", "toDatasetId"],
              properties: {
                fromDatasetId: { type: "string" },
                toDatasetId: { type: "string" },
                flowKind: {
                  type: "string",
                  enum: ["replication", "backup", "api_exposure", "etl", "sync", "other"]
                },
                description: { type: "string" }
              }
            }
          }
        }
      },
      responses: { "201": { description: "flow created", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/mapping/datasets": {
    get: {
      ...op("Mapping", "List mapped datasets"),
      responses: { "200": { description: "datasets", content: { "application/json": { schema: { type: "array" } } } } }
    }
  },
  "/api/mapping/systems": {
    get: { ...op("Mapping", "List source systems"), responses: { "200": { description: "systems", content: { "application/json": { schema: { type: "array" } } } } } }
  },
  "/api/mapping/fields": {
    get: {
      ...op("Mapping", "List mapped fields"),
      parameters: [
        { name: "datasetId", in: "query", schema: { type: "string" } },
        { name: "sensitiveCategory", in: "query", schema: { type: "string" } }
      ],
      responses: { "200": { description: "fields", content: { "application/json": { schema: { type: "array" } } } } }
    }
  },
  "/api/mapping/flows": {
    get: { ...op("Mapping", "List flows"), responses: { "200": { description: "flows", content: { "application/json": { schema: { type: "array" } } } } } }
  },
  "/api/mapping/lineage/dataset/{datasetId}": {
    get: {
      ...op("Mapping", "Dataset lineage view"),
      parameters: [{ $ref: "#/components/parameters/datasetId" }],
      responses: { "200": { description: "lineage", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/mapping/lineage/field/{fieldId}": {
    get: {
      ...op("Mapping", "Field lineage report"),
      parameters: [{ $ref: "#/components/parameters/fieldId" }],
      responses: { "200": { description: "lineage", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/mapping/duplicates": {
    get: { ...op("Mapping", "Duplicate sensitive groups"), responses: { "200": { description: "groups", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/mapping/export": {
    get: { ...op("Mapping", "Export inventory JSON"), responses: { "200": { description: "export payload", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/profiling/profile": {
    post: {
      ...op("Profiling", "Build profiling (+ optional risk + catalog persist)"),
      requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/ProfilingRequest" } } } },
      responses: { "200": { description: "profile, risk, optional catalog", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/catalog/register": {
    post: {
      ...op("Profiling", "Register snapshot in catalog"),
      requestBody: { content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
      responses: { "200": { description: "snapshot", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/catalog/datasets": {
    get: { ...op("Profiling", "List catalog datasets"), responses: { "200": { description: "datasets", content: { "application/json": { schema: { type: "array" } } } } } }
  },
  "/api/risk/analyze": {
    post: {
      ...op("Risk", "Full privacy risk analysis from discovery"),
      requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/RiskAnalyzeRequest" } } } },
      responses: { "200": jsonResp("analysis, assessment, profile", "#/components/schemas/RiskAnalyzeResponse") }
    }
  },
  "/api/risk/high-risk-datasets": {
    get: {
      ...op("Risk", "High/critical risk datasets from catalog"),
      parameters: [
        { name: "minLevel", in: "query", schema: { type: "string", enum: ["high", "critical"] } },
        { name: "limit", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": { description: "high-risk dataset list", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/risk/prioritization": {
    get: {
      ...op("Risk", "Ranked remediation queue"),
      parameters: [
        { name: "minLevel", in: "query", schema: { type: "string", enum: ["medium", "high", "critical"] } },
        { name: "limit", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": { description: "prioritized items", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/risk/aggregation/sources": {
    get: { ...op("Risk", "Risk aggregation per source"), responses: { "200": { description: "source aggregations", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/risk/aggregation/systems": {
    get: { ...op("Risk", "Risk aggregation per system"), responses: { "200": { description: "system aggregations", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/risk/compliance": {
    post: {
      ...op("Risk", "Compliance intelligence (regulations, controls, flags, remediation)"),
      requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/ComplianceIntelligenceRequest" } } } },
      responses: { "200": jsonResp("compliance intelligence report", "#/components/schemas/ComplianceIntelligenceResponse") }
    }
  },
  "/api/risk/compliance/catalog": {
    get: {
      ...op("Risk", "Compliance regulation and control catalog"),
      responses: { "200": { description: "regulations and controls", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/risk/compliance-exposure": {
    get: { ...op("Risk", "Compliance exposure summary"), responses: { "200": { description: "compliance scores", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/remediation": {
    get: {
      ...op("Remediation", "Search remediation tickets"),
      parameters: [
        { name: "q", in: "query", schema: { type: "string" }, description: "Search source, risk type, action, assignee" },
        { name: "status", in: "query", schema: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] } },
        { name: "severity", in: "query", schema: { type: "string", enum: ["low", "medium", "high", "critical"] } },
        { name: "datasetId", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "pageSize", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": jsonResp("paginated remediation list", "#/components/schemas/RemediationListResponse") }
    },
    post: {
      ...op("Remediation", "Create remediation ticket"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["source", "riskType", "classificationCategory", "suggestedAction", "severity"],
              properties: {
                source: { type: "string" },
                riskType: { type: "string" },
                classificationCategory: { type: "string" },
                suggestedAction: { type: "string" },
                severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                assignedUser: { type: "string" },
                resolutionNotes: { type: "string" },
                datasetId: { type: "string" },
                status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] }
              }
            }
          }
        }
      },
      responses: { "201": jsonResp("created ticket", "#/components/schemas/RemediationTicket") }
    }
  },
  "/api/remediation/from-prioritization": {
    post: {
      ...op("Remediation", "Bulk-create tickets from risk prioritization queue"),
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                minLevel: { type: "string", enum: ["medium", "high", "critical"] },
                limit: { type: "integer" },
                skipExistingForDataset: { type: "boolean" }
              }
            }
          }
        }
      },
      responses: { "201": { description: "created tickets", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/remediation/{id}": {
    get: {
      ...op("Remediation", "Get remediation ticket by id"),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      responses: { "200": jsonResp("ticket", "#/components/schemas/RemediationTicket") }
    },
    patch: {
      ...op("Remediation", "Update remediation ticket"),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                source: { type: "string" },
                riskType: { type: "string" },
                classificationCategory: { type: "string" },
                suggestedAction: { type: "string" },
                severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] },
                assignedUser: { type: "string", nullable: true },
                resolutionNotes: { type: "string", nullable: true },
                actor: { type: "string" }
              }
            }
          }
        }
      },
      responses: { "200": jsonResp("updated ticket", "#/components/schemas/RemediationTicket") }
    }
  },
  "/api/remediation/{id}/history": {
    get: {
      ...op("Remediation", "Per-ticket remediation audit history"),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      responses: { "200": { description: "history entries", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/search/datasets": {
    get: {
      ...op("Search", "Search governance datasets (compliance, risk, remediation, multi-label, keyword, cursor)"),
      parameters: [
        { name: "riskLevel", in: "query", schema: { type: "string", enum: ["low", "medium", "high", "critical"] } },
        { name: "riskLevels", in: "query", schema: { type: "string", description: "Comma-separated risk levels" } },
        { name: "minRiskScore", in: "query", schema: { type: "number" } },
        { name: "maxRiskScore", in: "query", schema: { type: "number" } },
        { name: "classification", in: "query", schema: { type: "string" } },
        { name: "classifications", in: "query", schema: { type: "string", description: "Comma-separated labels (AND by default)" } },
        { name: "classificationMode", in: "query", schema: { type: "string", enum: ["and", "or"] } },
        { name: "sourceType", in: "query", schema: { type: "string" } },
        { name: "sourceName", in: "query", schema: { type: "string" } },
        { name: "systemId", in: "query", schema: { type: "string" } },
        { name: "datasetId", in: "query", schema: { type: "string" } },
        { name: "detectionType", in: "query", schema: { type: "string" } },
        { name: "detectionCategory", in: "query", schema: { type: "string" } },
        { name: "detectionCategories", in: "query", schema: { type: "string", description: "e.g. aadhaar,pan (AND)" } },
        { name: "detectionMode", in: "query", schema: { type: "string", enum: ["and", "or"] } },
        { name: "complianceRegulation", in: "query", schema: { type: "string", enum: ["GDPR", "DPDP", "HIPAA", "CCPA", "ISO27001"] } },
        { name: "complianceViolation", in: "query", schema: { type: "boolean" } },
        { name: "complianceStatus", in: "query", schema: { type: "string" } },
        { name: "hasUnresolvedRemediation", in: "query", schema: { type: "boolean" } },
        { name: "q", in: "query", schema: { type: "string", description: "Keyword search" } },
        { name: "sortBy", in: "query", schema: { type: "string", enum: ["updatedAt", "riskScore", "riskLevel", "sourceName", "complianceScore"] } },
        { name: "sortOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        { name: "cursor", in: "query", schema: { type: "string" } },
        { name: "mappedOnly", in: "query", schema: { type: "boolean" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "pageSize", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": { description: "page of results", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/search/global": {
    get: {
      ...op("Search", "Global keyword search across datasets, fields, remediation, lineage, sources"),
      parameters: [
        { name: "q", in: "query", required: true, schema: { type: "string" } },
        { name: "types", in: "query", schema: { type: "string", description: "Comma-separated: datasets,fields,remediation,lineage,sources" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "pageSize", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": { description: "grouped search hits", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/search/lineage": {
    get: {
      ...op("Search", "Search data lineage by dataset, system, flow, or related source name"),
      parameters: [
        { name: "datasetId", in: "query", schema: { type: "string" } },
        { name: "systemId", in: "query", schema: { type: "string" } },
        { name: "direction", in: "query", schema: { type: "string", enum: ["upstream", "downstream", "both"] } },
        { name: "flowKind", in: "query", schema: { type: "string" } },
        { name: "relatedSourceName", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "pageSize", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": { description: "lineage hits", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/search/remediation": {
    get: {
      ...op("Search", "Search remediation tickets (unresolved filter, keyword, cursor)"),
      parameters: [
        { name: "q", in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string" } },
        { name: "unresolved", in: "query", schema: { type: "boolean" } },
        { name: "severity", in: "query", schema: { type: "string" } },
        { name: "datasetId", in: "query", schema: { type: "string" } },
        { name: "sortBy", in: "query", schema: { type: "string" } },
        { name: "sortOrder", in: "query", schema: { type: "string" } },
        { name: "cursor", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "pageSize", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": { description: "remediation page", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/search/mapped-fields": {
    get: {
      ...op("Search", "Search mapped fields"),
      parameters: [
        { name: "datasetId", in: "query", schema: { type: "string" } },
        { name: "sensitiveCategory", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "pageSize", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": { description: "page", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/search/duplicate-sensitive": {
    get: { ...op("Search", "Cross-source duplicate semantics"), responses: { "200": { description: "duplicates", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/analytics": {
    get: { ...op("Dashboard", "Full dashboard analytics payload"), responses: { "200": { description: "analytics JSON", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/records": {
    get: { ...op("Dashboard", "Record metrics"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/classification": {
    get: { ...op("Dashboard", "Classification metrics"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/risk": {
    get: { ...op("Dashboard", "Risk metrics"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/discovery": {
    get: { ...op("Dashboard", "Discovery metrics"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/sources": {
    get: { ...op("Dashboard", "Per-source metrics"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/profiling": {
    get: { ...op("Dashboard", "Profiling metrics"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/mapping": {
    get: { ...op("Dashboard", "Mapping metrics"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/high-risk-sources": {
    get: { ...op("Dashboard", "High-risk sources"), responses: { "200": { description: "list", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/sources-count": {
    get: { ...op("Dashboard", "Total scanned sources"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/high-risk-datasets": {
    get: { ...op("Dashboard", "High-risk datasets"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/compliance": {
    get: { ...op("Dashboard", "Compliance violations"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/heatmap": {
    get: { ...op("Dashboard", "Source-wise risk heatmap"), responses: { "200": { description: "heatmap", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/remediation": {
    get: { ...op("Dashboard", "Remediation status metrics"), responses: { "200": { description: "metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/metrics/exposure": {
    get: { ...op("Dashboard", "Most exposed systems"), responses: { "200": { description: "systems", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/governance": {
    get: { ...op("Dashboard", "Data governance dashboard payload"), responses: { "200": { description: "governance metrics", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/dashboard/summary": {
    get: { ...op("Dashboard", "Aggregated summary"), responses: { "200": { description: "summary", content: { "application/json": { schema: { type: "object" } } } } } }
  },
  "/api/reports/types": {
    get: {
      ...op("Reporting", "List supported report types and export formats"),
      responses: {
        "200": {
          description: "report catalog",
          content: { "application/json": { schema: { type: "object" } } }
        }
      }
    }
  },
  "/api/reports": {
    get: {
      ...op("Reporting", "Search report history"),
      parameters: [
        { name: "reportType", in: "query", schema: { type: "string" } },
        { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv", "pdf"] } },
        { name: "q", in: "query", schema: { type: "string" } },
        { name: "generatedFrom", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "generatedTo", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "pageSize", in: "query", schema: { type: "integer" } }
      ],
      responses: {
        "200": {
          description: "paginated report list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: { $ref: "#/components/schemas/ReportRecord" } },
                  total: { type: "integer" },
                  page: { type: "integer" },
                  pageSize: { type: "integer" }
                }
              }
            }
          }
        }
      }
    }
  },
  "/api/reports/generate": {
    post: {
      ...op("Reporting", "Generate audit-ready report"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["reportType", "format"],
              properties: {
                reportType: {
                  type: "string",
                  enum: [
                    "privacy_risk",
                    "compliance",
                    "source_discovery",
                    "classification_summary",
                    "remediation",
                    "executive_summary"
                  ]
                },
                format: { type: "string", enum: ["json", "csv", "pdf"] },
                generatedBy: { type: "string" },
                tags: { type: "array", items: { type: "string" } }
              }
            },
            example: { reportType: "executive_summary", format: "json", generatedBy: "security-team" }
          }
        }
      },
      responses: {
        "201": {
          description: "report generated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  report: { $ref: "#/components/schemas/ReportRecord" },
                  download: { type: "object" }
                }
              }
            }
          }
        },
        "400": { description: "validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } }
      }
    }
  },
  "/api/reports/{id}": {
    get: {
      ...op("Reporting", "Get stored report with full structured content"),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      responses: {
        "200": {
          description: "report",
          content: {
            "application/json": {
              schema: {
                allOf: [
                  { $ref: "#/components/schemas/ReportRecord" },
                  { type: "object", properties: { content: { type: "object" } } }
                ]
              }
            }
          }
        },
        "404": { description: "not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } }
      }
    }
  },
  "/api/reports/{id}/download": {
    get: {
      ...op("Reporting", "Download report (JSON, CSV, or PDF attachment)"),
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv", "pdf"] } }
      ],
      responses: {
        "200": { description: "file download" },
        "404": { description: "not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } }
      }
    }
  },
  "/api/alerts": {
    get: {
      ...op("Alerts", "List alert events"),
      parameters: [
        {
          name: "type",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "critical_sensitive_discovery",
              "compliance_violation",
              "failed_scan",
              "high_risk_dataset",
              "remediation_overdue"
            ]
          }
        },
        { name: "severity", in: "query", schema: { type: "string", enum: ["low", "medium", "high", "critical"] } },
        {
          name: "status",
          in: "query",
          schema: { type: "string", enum: ["pending", "queued", "delivered", "suppressed", "failed"] }
        },
        { name: "datasetId", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "pageSize", in: "query", schema: { type: "integer" } }
      ],
      responses: {
        "200": {
          description: "paginated alerts",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: { $ref: "#/components/schemas/AlertEvent" } },
                  total: { type: "integer" },
                  page: { type: "integer" },
                  pageSize: { type: "integer" }
                }
              }
            }
          }
        }
      }
    }
  },
  "/api/alerts/stats": {
    get: {
      ...op("Alerts", "Alert counts by status and type"),
      responses: { "200": { description: "stats", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/alerts/notifications": {
    get: {
      ...op("Alerts", "In-app notifications"),
      parameters: [
        { name: "unreadOnly", in: "query", schema: { type: "boolean" } },
        { name: "type", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "pageSize", in: "query", schema: { type: "integer" } }
      ],
      responses: { "200": { description: "notifications", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/alerts/notifications/read-all": {
    post: {
      ...op("Alerts", "Mark all in-app notifications as read"),
      responses: { "200": { description: "marked count", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/alerts/notifications/{id}/read": {
    patch: {
      ...op("Alerts", "Mark notification read"),
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      responses: {
        "200": { description: "updated", content: { "application/json": { schema: { type: "object" } } } },
        "404": { description: "not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } }
      }
    }
  },
  "/api/alerts/email-outbox": {
    get: {
      ...op("Alerts", "Email delivery log"),
      parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }],
      responses: { "200": { description: "outbox entries", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/alerts/evaluate-overdue": {
    post: {
      ...op("Alerts", "Run remediation overdue check"),
      responses: { "200": { description: "evaluation result", content: { "application/json": { schema: { type: "object" } } } } }
    }
  },
  "/api/audit/logs": {
    get: {
      ...op("Audit", "Query audit trail"),
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer" } },
        { name: "action", in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string" } },
        { name: "sourcePrefix", in: "query", schema: { type: "string" } }
      ],
      responses: {
        "200": {
          description: "entries",
          content: {
            "application/json": {
              example: {
                count: 1,
                items: [
                  {
                    id: "550e8400-e29b-41d4-a716-446655440000",
                    timestamp: "2026-05-15T12:00:00.000Z",
                    source: "api:discovery/scan",
                    action: "discovery_scan",
                    status: "success",
                    durationMs: 42
                  }
                ]
              }
            }
          }
        }
      }
    }
  }
};

// Fix duplicate key: /api/mapping/datasets had post and get merged wrong in object literal — rebuild mapping datasets as single path with get+post
delete paths["/api/mapping/datasets"];
paths["/api/mapping/datasets"] = {
  post: {
    tags: ["Mapping"],
    summary: "Register dataset manually",
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              sourceType: { type: "string" },
              sourceName: { type: "string" },
              entityName: { type: "string" }
            },
            example: { sourceType: "database", sourceName: "prod-pg", entityName: "public.users" }
          }
        }
      }
    },
    responses: {
      "201": {
        description: "system + dataset",
        content: {
          "application/json": {
            example: {
              system: { id: "sys-demo", sourceType: "database", sourceName: "prod-pg" },
              dataset: { id: "ds-demo", systemId: "sys-demo", entityName: "public.users" }
            }
          }
        }
      }
    }
  },
  get: {
    tags: ["Mapping"],
    summary: "List mapped datasets",
    responses: { "200": { description: "datasets", content: { "application/json": { schema: { type: "array" } } } } }
  }
};

const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Data Ingestion & Privacy Intelligence API",
    version: "1.0.0",
    description:
      "Proteccio Discover backend covering Week 1 ingestion, Week 2 discovery/classification/mapping/profiling, Week 3 governance/compliance intelligence, and Week 4 source onboarding, Supabase-backed persistence, realtime dashboard updates, end-to-end workflow orchestration, reporting, RBAC, alerting, and global search.\n\n**Auth:** When `JWT_SECRET` or Supabase Auth is configured, use `POST /api/auth/login` and send `Authorization: Bearer <token>`. When only `API_KEY` is set, send `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>` on `/api/*` except `/health` and documentation routes.\n\n**Docs UI:** `GET /docs` (Swagger UI). **Raw spec:** `GET /openapi.json`."
  },
  servers: [{ url: "{baseUrl}", variables: { baseUrl: { default: "http://localhost:3000" } } }],
  tags,
  security,
  paths,
  components
};

fs.writeFileSync(path.join(openapiDir, "openapi.json"), JSON.stringify(openapi, null, 2), "utf8");

function pmItem(name, method, url, body = undefined, desc = "", opts = {}) {
  const { noAuth = false } = opts;
  const [pathname, queryString] = url.split("?");
  const pathSegments = pathname.replace(/^\//, "").split("/").filter(Boolean);
  const query =
    queryString?.split("&").map((pair) => {
      const eq = pair.indexOf("=");
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? "" : pair.slice(eq + 1);
      return { key: k, value: decodeURIComponent(v) };
    }) ?? [];

  const req = {
    auth: noAuth ? { type: "noauth" } : { type: "bearer", bearer: [{ key: "token", value: "{{apiKey}}", type: "string" }] },
    method,
    header:
      method !== "GET" && body !== undefined
        ? [{ key: "Content-Type", value: "application/json" }]
        : [],
    url: {
      raw: "{{baseUrl}}" + url,
      host: ["{{baseUrl}}"],
      path: pathSegments,
      ...(query.length ? { query } : {})
    },
    description: desc
  };
  if (body !== undefined) {
    req.body = { mode: "raw", raw: typeof body === "string" ? body : JSON.stringify(body, null, 2) };
  }
  return { name, request: req };
}

const collection = {
  info: {
    name: "Data Ingestion & Privacy Intelligence",
    description:
      "Import into Postman. Set collection variables `baseUrl` (e.g. http://localhost:3000) and `apiKey` when the server uses API_KEY.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:3000" },
    { key: "apiKey", value: "" }
  ],
  item: [
    {
      name: "Health",
      item: [pmItem("GET /health", "GET", "/health", undefined, "No auth.", { noAuth: true })]
    },
    {
      name: "Auth",
      item: [
        pmItem("POST login", "POST", "/api/auth/login", {
          email: "superadmin@discover.app",
          password: "SuperAdmin1!"
        }, "No auth. Returns JWT.", { noAuth: true }),
        pmItem("POST signup", "POST", "/api/auth/signup", {
          email: "new.user@example.com",
          password: "Viewer123!",
          displayName: "New User"
        }, "No auth. Creates a viewer account.", { noAuth: true }),
        pmItem("POST forgot password", "POST", "/api/auth/forgot-password", {
          email: "viewer@example.com"
        }, "No auth. Starts Supabase reset when configured.", { noAuth: true }),
        pmItem("POST refresh", "POST", "/api/auth/refresh", {
          refreshToken: "replace-with-supabase-refresh-token"
        }, "No auth. Supabase sessions only.", { noAuth: true }),
        pmItem("POST logout", "POST", "/api/auth/logout"),
        pmItem("GET me", "GET", "/api/auth/me"),
        pmItem("GET roles", "GET", "/api/auth/roles"),
        pmItem("GET users", "GET", "/api/auth/users"),
        pmItem("POST create user", "POST", "/api/auth/users", {
          email: "newuser@local",
          password: "ChangeMe1!",
          displayName: "New User",
          role: "viewer"
        })
      ]
    },
    {
      name: "Platform",
      item: [
        pmItem("GET platform status", "GET", "/api/platform/status"),
        pmItem("GET realtime dashboard stream", "GET", "/api/realtime/dashboard")
      ]
    },
    {
      name: "Sources",
      item: [
        pmItem("GET sources", "GET", "/api/sources"),
        pmItem("POST register Postgres source", "POST", "/api/sources", {
          name: "customer-production-db",
          type: "postgres",
          owner: "privacy-team@example.com",
          environment: "production",
          connection: {
            host: "db.internal",
            port: 5432,
            database: "customers",
            authMode: "secret_ref",
            secretRef: "supabase-vault:prod/customer-db"
          },
          tags: ["production", "customer-data"]
        }),
        pmItem("POST check source", "POST", "/api/sources/00000000-0000-0000-0000-000000000000/check", { ok: true })
      ]
    },
    {
      name: "Workflow",
      item: [
        pmItem("POST run end-to-end workflow", "POST", "/api/workflow/run", {
          records: [
            { email: "riya@example.com", aadhaar: "2345 6789 0123", city: "Pune" },
            { email: "alex@example.com", pan: "ABCDE1234F", diagnosis: "diabetes" }
          ],
          sourceType: "file",
          sourceName: "dashboard-workbench",
          entityName: "sample-records.json",
          createRemediation: true,
          reportFormat: "json"
        })
      ]
    },
    {
      name: "Ingestion",
      item: [
        pmItem("GET Postgres health", "GET", "/api/db/postgres/health"),
        pmItem("GET Postgres schema", "GET", "/api/db/postgres/schema"),
        pmItem("GET MySQL health", "GET", "/api/db/mysql/health"),
        pmItem("GET MySQL schema", "GET", "/api/db/mysql/schema"),
        pmItem("GET MongoDB health", "GET", "/api/db/mongodb/health"),
        pmItem("GET MongoDB schema", "GET", "/api/db/mongodb/schema"),
        pmItem("GET S3 buckets", "GET", "/api/s3/buckets"),
        {
          name: "GET S3 files",
          request: {
            auth: { type: "bearer", bearer: [{ key: "token", value: "{{apiKey}}", type: "string" }] },
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/s3/files?bucket=my-bucket&prefix=&maxKeys=50",
              host: ["{{baseUrl}}"],
              path: ["api", "s3", "files"],
              query: [
                { key: "bucket", value: "my-bucket" },
                { key: "prefix", value: "" },
                { key: "maxKeys", value: "50" }
              ]
            }
          }
        },
        pmItem("POST ingest API", "POST", "/api/ingest/api", {
          url: "https://jsonplaceholder.typicode.com/posts",
          method: "GET",
          discovery: false
        }),
        pmItem("POST Postgres table preview", "POST", "/api/ingest/postgres/table/preview", {
          tableName: "users",
          limit: 20
        }),
        pmItem("GET ingestion history", "GET", "/api/history")
      ]
    },
    {
      name: "Discovery",
      item: [
        pmItem("POST discovery scan", "POST", "/api/discovery/scan", {
          records: [{ contact: { email: "user@example.com" } }],
          sourceType: "file",
          sourceName: "demo",
          entityName: "batch-1",
          classify: false
        }),
        pmItem("GET discovery categories", "GET", "/api/discovery/categories")
      ]
    },
    {
      name: "Classification",
      item: [
        pmItem("POST classification (needs discovery body)", "POST", "/api/classification/classify", {
          discovery: {
            scannedRecords: 1,
            findingsPerRecord: [],
            summary: {},
            trace: { sourceType: "file", sourceName: "x", entityName: "y" }
          }
        })
      ]
    },
    {
      name: "Mapping",
      item: [
        pmItem("POST mapping datasets", "POST", "/api/mapping/datasets", {
          sourceType: "database",
          sourceName: "pg-main",
          entityName: "public.users"
        }),
        pmItem("GET mapping datasets", "GET", "/api/mapping/datasets"),
        pmItem("GET mapping export", "GET", "/api/mapping/export")
      ]
    },
    {
      name: "Profiling",
      item: [
        pmItem("POST profiling profile", "POST", "/api/profiling/profile", {
          discovery: {
            scannedRecords: 1,
            findingsPerRecord: [],
            summary: {},
            trace: { sourceType: "file", sourceName: "demo", entityName: "e1" }
          },
          persist: false
        })
      ]
    },
    {
      name: "Search",
      item: [
        pmItem("GET search datasets", "GET", "/api/search/datasets?page=1&pageSize=20"),
        pmItem("GET search datasets GDPR violations", "GET", "/api/search/datasets?complianceRegulation=GDPR&complianceViolation=true"),
        pmItem("GET search datasets critical risk", "GET", "/api/search/datasets?riskLevel=critical&sortBy=riskScore&sortOrder=desc"),
        pmItem("GET search datasets aadhaar + financial", "GET", "/api/search/datasets?detectionCategories=aadhaar&classifications=Financial%20Data"),
        pmItem("GET search global", "GET", "/api/search/global?q=gdpr"),
        pmItem("GET search lineage", "GET", "/api/search/lineage?direction=both&page=1&pageSize=20"),
        pmItem("GET search remediation unresolved", "GET", "/api/search/remediation?unresolved=true"),
        pmItem("GET search mapped-fields", "GET", "/api/search/mapped-fields?page=1&pageSize=20")
      ]
    },
    {
      name: "Dashboard",
      item: [
        pmItem("GET dashboard analytics", "GET", "/api/dashboard/analytics"),
        pmItem("GET dashboard governance", "GET", "/api/dashboard/governance"),
        pmItem("GET dashboard summary", "GET", "/api/dashboard/summary"),
        pmItem("GET dashboard compliance metrics", "GET", "/api/dashboard/metrics/compliance"),
        pmItem("GET dashboard remediation metrics", "GET", "/api/dashboard/metrics/remediation"),
        pmItem("GET dashboard heatmap", "GET", "/api/dashboard/metrics/heatmap")
      ]
    },
    {
      name: "Audit",
      item: [pmItem("GET audit logs", "GET", "/api/audit/logs?limit=50")]
    },
    {
      name: "Alerts",
      item: [
        pmItem("GET alerts", "GET", "/api/alerts?page=1&pageSize=20"),
        pmItem("GET alert stats", "GET", "/api/alerts/stats"),
        pmItem("GET notifications", "GET", "/api/alerts/notifications?unreadOnly=true"),
        pmItem("POST evaluate overdue", "POST", "/api/alerts/evaluate-overdue"),
        pmItem("GET email outbox", "GET", "/api/alerts/email-outbox?limit=20")
      ]
    },
    {
      name: "Reporting",
      item: [
        pmItem("GET report types", "GET", "/api/reports/types"),
        pmItem("GET report history", "GET", "/api/reports?page=1&pageSize=20"),
        pmItem("POST generate executive summary (JSON)", "POST", "/api/reports/generate", {
          reportType: "executive_summary",
          format: "json",
          generatedBy: "demo-user"
        }),
        pmItem("POST generate privacy risk (PDF)", "POST", "/api/reports/generate", {
          reportType: "privacy_risk",
          format: "pdf"
        }),
        pmItem("GET report by id (replace id)", "GET", "/api/reports/00000000-0000-0000-0000-000000000000"),
        pmItem("GET download report CSV (replace id)", "GET", "/api/reports/00000000-0000-0000-0000-000000000000/download?format=csv")
      ]
    }
  ]
};

fs.writeFileSync(path.join(root, "postman_collection.json"), JSON.stringify(collection, null, 2), "utf8");
console.log("Wrote openapi/openapi.json and postman_collection.json");
