import { SourceMetadata, SourceType } from "../types";

interface MetadataInput {
  sourceName: string;
  sourceType: SourceType;
  entityName: string;
  fileType?: string;
  fileSizeBytes?: number;
  recordCount?: number;
  owner?: string;
  createdDate?: Date;
  modifiedDate?: Date;
}

export function buildMetadata(input: MetadataInput): SourceMetadata {
  return {
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    entityName: input.entityName,
    fileType: input.fileType,
    fileSizeBytes: input.fileSizeBytes,
    recordCount: input.recordCount,
    owner: input.owner,
    createdDate: input.createdDate?.toISOString(),
    modifiedDate: input.modifiedDate?.toISOString()
  };
}
