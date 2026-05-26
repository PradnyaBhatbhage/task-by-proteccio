import { env } from "./env";

/**
 * Fail fast in production when mandatory security configuration is missing.
 */
export function assertSecurityConfiguration(): void {
  if (env.NODE_ENV !== "production") return;

  const hasJwt = Boolean(env.JWT_SECRET?.trim());
  const hasApiKey = Boolean(env.API_KEY?.trim());
  if (!hasJwt && !hasApiKey) {
    throw new Error(
      "Production requires JWT_SECRET or API_KEY. Set at least one before exposing this service."
    );
  }

  if (env.SEED_DEFAULT_USERS) {
    throw new Error(
      "SEED_DEFAULT_USERS must be false in production. Create real users via POST /api/auth/users."
    );
  }
}
