import { randomUUID } from "crypto";
import type { ClassificationScanResult } from "../classification/types";
import type { DiscoveryScanResult } from "../discovery";
import { persistMappingInventory } from "../supabase/governance-persistence";
import type { DataFlow, DataFlowKind, Dataset, MappedField, MappingInventoryExport, SourceSystem } from "./types";
import {
  buildDatasetLineageView,
  buildFieldLineageReport,
  computeDuplicateSensitiveGroups,
  materializeFromDiscoveryScan
} from "./engine";

/**
 * In-memory mapping registry. Swap for a persistent repository without changing route handlers.
 */
export class MappingRegistry {
  private readonly systems = new Map<string, SourceSystem>();
  private readonly datasets = new Map<string, Dataset>();
  private readonly fields = new Map<string, MappedField>();
  private readonly flows = new Map<string, DataFlow>();

  /** Upserts system + dataset rows and appends one row per discovery finding. */
  ingestDiscoveryScan(
    discovery: DiscoveryScanResult,
    classification?: ClassificationScanResult
  ): { system: SourceSystem; dataset: Dataset; fields: MappedField[] } {
    const { system, dataset, fields } = materializeFromDiscoveryScan(discovery, classification);
    this.systems.set(system.id, system);
    this.datasets.set(dataset.id, dataset);
    for (const f of fields) {
      this.fields.set(f.id, f);
    }
    this.persist();
    return { system, dataset, fields };
  }

  registerDatasetManual(dataset: Dataset, system: SourceSystem): void {
    this.systems.set(system.id, system);
    this.datasets.set(dataset.id, dataset);
    this.persist();
  }

  addFlow(input: {
    fromDatasetId: string;
    toDatasetId: string;
    flowKind: DataFlowKind;
    description?: string;
  }): DataFlow {
    if (input.fromDatasetId === input.toDatasetId) {
      throw new Error("Flow endpoints must be distinct datasets.");
    }
    const missing: string[] = [];
    if (!this.datasets.has(input.fromDatasetId)) {
      missing.push(`fromDatasetId (${input.fromDatasetId})`);
    }
    if (!this.datasets.has(input.toDatasetId)) {
      missing.push(`toDatasetId (${input.toDatasetId})`);
    }
    if (missing.length > 0) {
      throw new Error(
        `Unknown dataset(s): ${missing.join(", ")}. Use the exact "dataset.id" from POST /api/mapping/from-scan or POST /api/mapping/datasets, then GET /api/mapping/datasets to verify. If the server restarted, register again (in-memory store).`
      );
    }
    const flow: DataFlow = { id: randomUUID(), ...input };
    this.flows.set(flow.id, flow);
    this.persist();
    return flow;
  }

  getField(fieldId: string): MappedField | undefined {
    return this.fields.get(fieldId);
  }

  listFields(filter?: { datasetId?: string; sensitiveCategory?: string }): MappedField[] {
    const all = [...this.fields.values()];
    let out = all;
    if (filter?.datasetId) {
      out = out.filter((f) => f.datasetId === filter.datasetId);
    }
    if (filter?.sensitiveCategory) {
      out = out.filter((f) => f.sensitiveCategory === filter.sensitiveCategory);
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }

  listDatasets(): Dataset[] {
    return [...this.datasets.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  listSystems(): SourceSystem[] {
    return [...this.systems.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  listFlows(): DataFlow[] {
    return [...this.flows.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  getDatasetLineage(datasetId: string) {
    return buildDatasetLineageView(datasetId, this.systems, this.datasets, [...this.flows.values()]);
  }

  getFieldLineage(fieldId: string) {
    const field = this.fields.get(fieldId);
    if (!field) return undefined;
    return buildFieldLineageReport(field, this.systems, this.datasets, [...this.flows.values()]);
  }

  getDuplicateSensitiveGroups() {
    return computeDuplicateSensitiveGroups([...this.fields.values()]);
  }

  exportInventory(): MappingInventoryExport {
    return {
      exportedAt: new Date().toISOString(),
      systems: this.listSystems(),
      datasets: this.listDatasets(),
      flows: this.listFlows(),
      fields: this.listFields(),
      duplicateGroups: this.getDuplicateSensitiveGroups()
    };
  }

  restoreInventory(inventory: Pick<MappingInventoryExport, "systems" | "datasets" | "fields" | "flows">): void {
    this.systems.clear();
    this.datasets.clear();
    this.fields.clear();
    this.flows.clear();
    for (const system of inventory.systems) this.systems.set(system.id, system);
    for (const dataset of inventory.datasets) this.datasets.set(dataset.id, dataset);
    for (const field of inventory.fields) this.fields.set(field.id, field);
    for (const flow of inventory.flows) this.flows.set(flow.id, flow);
  }

  clear(): void {
    this.systems.clear();
    this.datasets.clear();
    this.fields.clear();
    this.flows.clear();
    this.persist();
  }

  private persist(): void {
    void persistMappingInventory(this.exportInventory());
  }
}

export const mappingRegistry = new MappingRegistry();
