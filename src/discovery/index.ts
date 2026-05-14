export type {
  Confidence,
  DetectionMethod,
  DiscoveryFinding,
  DiscoveryScanOptions,
  DiscoveryScanRecordResult,
  DiscoveryScanResult,
  SensitiveCategory,
  SourceTrace,
  SourceType
} from "./types";

export { flattenRecord } from "./flatten";
export type { FlatLeaf } from "./flatten";
export { scanRecords, scanRecordsBatched } from "./engine";
export { analyzeLeaf, leafValueToText } from "./analyze-leaf";
