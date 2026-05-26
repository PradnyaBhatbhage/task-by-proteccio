import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import { ROLE_LABELS, ROLE_PERMISSIONS, signAccessToken, userStore } from "../auth";
import { ROLES, type Role } from "../auth/types";
import { env } from "../config/env";
import { requirePermission } from "../middleware/authorize";
import { getActorId } from "../middleware/authenticate";
import { loginRateLimiter } from "../middleware/rate-limit";

const router = Router();

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(256)
  .refine((email) => z.string().email().safeParse(email).success || /^[^@\s]+@local$/.test(email), {
    message: "Invalid email address"
  });

const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8).max(256)
});

const CreateUserSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8).max(256),
  displayName: z.string().min(1).max(128),
  role: z.enum(["super_admin", "privacy_admin", "security_analyst", "auditor", "viewer"])
});

const UpdateUserSchema = z
  .object({
    displayName: z.string().min(1).max(128).optional(),
    role: z.enum(["super_admin", "privacy_admin", "security_analyst", "auditor", "viewer"]).optional(),
    active: z.boolean().optional(),
    password: z.string().min(8).max(256).optional()
  })
  .refine((b) => Object.keys(b).length > 0, { message: "At least one field is required" });

/**
 * POST /api/auth/login
 * Issue JWT access token (public when RBAC enabled).
 */
router.post("/auth/login", loginRateLimiter, async (req, res) => {
  const started = Date.now();

  if (!env.RBAC_ENABLED) {
    return res.status(503).json({
      error: "RBAC disabled",
      message: "Set JWT_SECRET in environment to enable authentication"
    });
  }

  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    auditTrail.append({
      source: "api:auth/login",
      action: "auth_login",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "validation_error" }
    });
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  const user = await userStore.verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    auditTrail.append({
      source: "api:auth/login",
      action: "auth_login",
      status: "failure",
      durationMs: Date.now() - started,
      metadata: { reason: "invalid_credentials" }
    });
    return res.status(401).json({ error: "Unauthorized", message: "Invalid email or password" });
  }

  const token = signAccessToken({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role
  });

  auditTrail.append({
    source: "api:auth/login",
    action: "auth_login",
    status: "success",
    durationMs: Date.now() - started,
    metadata: { userId: user.id, role: user.role }
  });

  return res.json({
    token,
    tokenType: "Bearer",
    expiresIn: env.JWT_EXPIRES_IN,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    }
  });
});

/**
 * GET /api/auth/me
 */
router.get("/auth/me", (req, res) => {
  if (!env.RBAC_ENABLED) {
    return res.status(503).json({ error: "RBAC disabled" });
  }
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stored = userStore.getById(req.user.id);
  return res.json({
    principal: req.user,
    user: stored ?? {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName,
      role: req.user.role
    },
    permissions: [...ROLE_PERMISSIONS[req.user.role]]
  });
});

/**
 * GET /api/auth/roles
 */
router.get("/auth/roles", (_req, res) => {
  const roles = ROLES.filter((r) => r !== "service").map((role) => ({
    role,
    label: ROLE_LABELS[role],
    permissions: [...ROLE_PERMISSIONS[role as Role]]
  }));
  return res.json({ roles });
});

/**
 * GET /api/auth/users — Super Admin only
 */
router.get("/auth/users", requirePermission("users:manage"), (_req, res) => {
  return res.json({ count: userStore.list().length, items: userStore.list() });
});

/**
 * POST /api/auth/users — Super Admin only
 */
router.post("/auth/users", requirePermission("users:manage"), async (req, res, next) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  try {
    const created = await userStore.create(parsed.data);
    auditTrail.append({
      source: "api:auth/users",
      action: "user_manage",
      status: "success",
      durationMs: 0,
      metadata: { createdUserId: created.id, role: created.role, actor: getActorId(req) ?? null }
    });
    return res.status(201).json({ item: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    if (message === "User already exists") {
      return res.status(409).json({ error: message });
    }
    return next(err);
  }
});

/**
 * PATCH /api/auth/users/:id — Super Admin only
 */
router.patch("/auth/users/:id", requirePermission("users:manage"), async (req, res, next) => {
  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
  }

  try {
    const updated = await userStore.update(String(req.params.id), parsed.data);
    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ item: updated });
  } catch (err) {
    return next(err);
  }
});

export default router;
