import { governanceCatalog } from "../catalog";
import type { GovernanceDatasetSnapshot } from "../catalog/types";
import { mappingRegistry } from "../mapping";
import type { MappingInventoryExport } from "../mapping/types";
import { remediationStore } from "../remediation";
import type { RemediationTicket } from "../remediation/types";
import { reportStore } from "../reporting";
import type { ReportRecord } from "../reporting/types";
import { sourceStore } from "../sources";
import type { ManagedSource } from "../sources/types";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { getSupabaseAdmin, isSupabaseConfigured } from "./client";

let hydrationStarted = false;

type SourceRow = {
  id: string;
  name: string;
  type: ManagedSource["type"];
  owner: string | null;
  environment: ManagedSource["environment"];
  status: ManagedSource["status"];
  connection: ManagedSource["connection"];
  tags: string[];
  last_checked_at: string | null;
  last_scan_at: string | null;
  created_at: string;
  updated_at: string;
};

type CatalogRow = {
  dataset_id: string;
  system_id: string;
  source_type: GovernanceDatasetSnapshot["trace"]["sourceType"];
  source_name: string;
  entity_name: string;
  risk_level: GovernanceDatasetSnapshot["riskLevel"];
  total_records: number;
  sensitive_records: number;
  mapped: boolean;
  discovery_summary: GovernanceDatasetSnapshot["discoveryCategoryTotals"];
  classification_summary: GovernanceDatasetSnapshot["classificationTotals"];
  profile: GovernanceDatasetSnapshot["profile"];
  risk: GovernanceDatasetSnapshot["risk"];
  created_at: string;
  updated_at: string;
};

type MappingRow = {
  systems: MappingInventoryExport["systems"];
  datasets: MappingInventoryExport["datasets"];
  fields: MappingInventoryExport["fields"];
  flows: MappingInventoryExport["flows"];
};

type RemediationRow = {
  id: string;
  dataset_id: string | null;
  source: string;
  risk_type: string;
  classification_category: string;
  suggested_action: string;
  assigned_user: string | null;
  resolution_notes: string | null;
  severity: RemediationTicket["severity"];
  status: RemediationTicket["status"];
  history: RemediationTicket["history"];
  created_at: string;
  updated_at: string;
};

type ReportRow = {
  id: string;
  report_type: ReportRecord["reportType"];
  title: string;
  generated_at: string;
  primary_format: ReportRecord["primaryFormat"];
  summary: string;
  tags: string[];
  generated_by: string | null;
  file_base_name: string;
  content: ReportRecord["content"];
};

export async function hydratePlatformStoresFromSupabase(): Promise<void> {
  if (hydrationStarted || !isSupabaseConfigured()) return;
  hydrationStarted = true;
  const admin = getSupabaseAdmin();
  if (!admin) return;

  try {
    const [sources, catalog, mapping, remediation, reports] = await Promise.all([
      admin.from(env.SUPABASE_SOURCE_TABLE).select("*").order("updated_at", { ascending: false }).limit(1000),
      admin.from(env.SUPABASE_CATALOG_TABLE).select("*").order("updated_at", { ascending: false }).limit(1000),
      admin.from(env.SUPABASE_MAPPING_TABLE).select("*").eq("id", "current").maybeSingle<MappingRow>(),
      admin.from(env.SUPABASE_REMEDIATION_TABLE).select("*").order("updated_at", { ascending: false }).limit(1000),
      admin.from(env.SUPABASE_REPORT_TABLE).select("*").order("generated_at", { ascending: false }).limit(500)
    ]);

    if (!sources.error) {
      for (const row of (sources.data ?? []) as SourceRow[]) {
        sourceStore.restore({
          id: row.id,
          name: row.name,
          type: row.type,
          owner: row.owner ?? undefined,
          environment: row.environment,
          status: row.status,
          connection: row.connection ?? {},
          tags: row.tags ?? [],
          lastCheckedAt: row.last_checked_at ?? undefined,
          lastScanAt: row.last_scan_at ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          supabaseSync: { enabled: true, ok: true }
        });
      }
    }

    if (!mapping.error && mapping.data) {
      mappingRegistry.restoreInventory({
        systems: mapping.data.systems ?? [],
        datasets: mapping.data.datasets ?? [],
        fields: mapping.data.fields ?? [],
        flows: mapping.data.flows ?? []
      });
    }

    if (!catalog.error) {
      for (const row of (catalog.data ?? []) as CatalogRow[]) {
        governanceCatalog.restore({
          datasetId: row.dataset_id,
          systemId: row.system_id,
          trace: {
            sourceType: row.source_type,
            sourceName: row.source_name,
            entityName: row.entity_name
          },
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          profile: row.profile,
          risk: row.risk,
          discoveryCategoryTotals: row.discovery_summary ?? {},
          classificationTotals: row.classification_summary ?? {},
          sensitiveRecordCount: row.sensitive_records,
          totalRecords: row.total_records,
          riskLevel: row.risk_level,
          mapped: row.mapped
        });
      }
    }

    if (!remediation.error) {
      for (const row of (remediation.data ?? []) as RemediationRow[]) {
        remediationStore.restore({
          id: row.id,
          datasetId: row.dataset_id ?? undefined,
          source: row.source,
          riskType: row.risk_type,
          classificationCategory: row.classification_category,
          suggestedAction: row.suggested_action,
          assignedUser: row.assigned_user ?? undefined,
          resolutionNotes: row.resolution_notes ?? undefined,
          severity: row.severity,
          status: row.status,
          history: row.history ?? [],
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    }

    if (!reports.error) {
      for (const row of (reports.data ?? []) as ReportRow[]) {
        reportStore.restore({
          id: row.id,
          reportType: row.report_type,
          title: row.title,
          generatedAt: row.generated_at,
          primaryFormat: row.primary_format,
          summary: row.summary,
          tags: row.tags ?? [],
          generatedBy: row.generated_by ?? undefined,
          fileBaseName: row.file_base_name,
          content: row.content
        });
      }
    }

    logger.info(
      {
        sources: sourceStore.list().length,
        catalog: governanceCatalog.size,
        remediation: remediationStore.list().length,
        reports: reportStore.list().length
      },
      "Hydrated platform stores from Supabase"
    );
  } catch (err) {
    logger.warn({ err }, "Supabase hydration skipped or failed");
  }
}
