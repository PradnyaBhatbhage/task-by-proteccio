import { env } from "../config/env";
import { governanceCatalog } from "../catalog";
import { TtlCache } from "../performance/cache";
import { buildDashboardAnalytics, type DashboardAnalytics } from "./dashboard-analytics.service";

const cache = new TtlCache<DashboardAnalytics>(
  env.DASHBOARD_CACHE_TTL_MS,
  () => governanceCatalog.revision
);

/**
 * Returns cached dashboard aggregates when valid; rebuilds on catalog change or TTL expiry.
 */
export function getDashboardAnalytics(refreshMapped = true): DashboardAnalytics {
  if (refreshMapped) {
    governanceCatalog.refreshMappedFlags();
  }
  const hit = cache.get();
  if (hit) return hit;
  return cache.set(buildDashboardAnalytics());
}

export function invalidateDashboardCache(): void {
  cache.invalidate();
}
