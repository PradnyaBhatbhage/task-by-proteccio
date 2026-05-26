import { env } from "../config/env";
import { logger } from "../utils/logger";
import { userStore } from "./store";
import type { Role } from "./types";

const DEFAULT_SEEDS: Array<{ email: string; password: string; displayName: string; role: Role }> = [
  { email: "superadmin@local", password: "SuperAdmin1!", displayName: "Super Admin", role: "super_admin" },
  { email: "privacy@local", password: "PrivacyAdmin1!", displayName: "Privacy Admin", role: "privacy_admin" },
  {
    email: "analyst@local",
    password: "SecurityAnalyst1!",
    displayName: "Security Analyst",
    role: "security_analyst"
  },
  { email: "auditor@local", password: "Auditor1!", displayName: "Auditor", role: "auditor" },
  { email: "viewer@local", password: "Viewer1!", displayName: "Viewer", role: "viewer" }
];

/** Seed demo users when RBAC is enabled and the store is empty (never in production). */
export async function bootstrapAuth(): Promise<void> {
  if (env.NODE_ENV === "production" || !env.RBAC_ENABLED || !env.SEED_DEFAULT_USERS) return;

  const before = userStore.list().length;
  await userStore.seedDefaults(DEFAULT_SEEDS);
  const after = userStore.list().length;

  if (after > before) {
    logger.info(
      { seeded: after - before, totalUsers: after },
      "RBAC: seeded default users (change passwords before production)"
    );
  }
}
