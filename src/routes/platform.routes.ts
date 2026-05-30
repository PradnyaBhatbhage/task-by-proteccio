import { Router } from "express";
import { env } from "../config/env";
import { getSupabaseStatus } from "../supabase/client";

const router = Router();

router.get("/platform/status", async (_req, res) => {
  const supabase = await getSupabaseStatus();
  return res.json({
    app: {
      name: "Proteccio Discover",
      phase: "week4-production-prototype",
      nodeEnv: env.NODE_ENV,
      auth: env.RBAC_ENABLED ? "jwt-rbac" : env.API_KEY ? "api-key" : "demo-open"
    },
    supabase,
    capabilities: {
      supabaseAuthentication: supabase.configured,
      supabasePostgres: supabase.configured,
      supabaseStorage: supabase.configured,
      supabaseApis: supabase.configured,
      supabaseRls: true,
      authentication: true,
      sourceManagement: true,
      discoveryClassification: true,
      mappingLineage: true,
      profiling: true,
      governanceCompliance: true,
      remediation: true,
      search: true,
      reporting: true,
      realtimeDashboard: true
    },
    deploymentReadiness: {
      productionSecretsConfigured: Boolean(env.JWT_SECRET || env.API_KEY),
      supabaseConfigured: supabase.configured,
      supabaseRequired: supabase.required,
      httpsEnforced: env.ENFORCE_HTTPS,
      seededUsersDisabled: env.NODE_ENV === "production" ? !env.SEED_DEFAULT_USERS : "development"
    }
  });
});

export default router;
