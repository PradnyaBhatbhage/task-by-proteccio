import { env } from "./env";

/**
 * Fail fast in production when mandatory security configuration is missing.
 */
export function assertSecurityConfiguration(): void {
  if (env.NODE_ENV !== "production") return;

  const hasJwt = Boolean(env.JWT_SECRET?.trim());
  const hasApiKey = Boolean(env.API_KEY?.trim());
  const hasSupabaseAuth = Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_ANON_KEY?.trim());
  if (!hasJwt && !hasApiKey && !hasSupabaseAuth) {
    throw new Error(
      "Production requires Supabase Auth, JWT_SECRET, or API_KEY. Set at least one before exposing this service."
    );
  }

  if (env.SEED_DEFAULT_USERS) {
    throw new Error(
      "SEED_DEFAULT_USERS must be false in production. Create real users via POST /api/auth/users."
    );
  }

  if (!env.SUPABASE_REQUIRED) {
    throw new Error("SUPABASE_REQUIRED must be true in production for the Week 4 prototype.");
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) {
    throw new Error(
      "Production requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  if (!env.ENFORCE_HTTPS) {
    throw new Error("ENFORCE_HTTPS must be true in production.");
  }
}
