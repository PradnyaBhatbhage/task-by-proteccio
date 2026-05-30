import { Router } from "express";
import { z } from "zod";
import { auditTrail } from "../audit";
import { sourceStore, type ManagedSource } from "../sources";

const router = Router();

const ConnectionSchema = z.object({
  host: z.string().min(1).max(512).optional(),
  port: z.coerce.number().int().positive().max(65_535).optional(),
  database: z.string().min(1).max(256).optional(),
  url: z.string().min(1).max(2048).optional(),
  bucket: z.string().min(1).max(256).optional(),
  prefix: z.string().max(1024).optional(),
  fileName: z.string().max(512).optional(),
  authMode: z.enum(["none", "api_key", "basic", "bearer", "credentials", "iam", "secret_ref"]).optional(),
  secretRef: z.string().max(512).optional()
});

const CreateSourceSchema = z.object({
  name: z.string().min(1).max(256),
  type: z.enum(["postgres", "mysql", "mongodb", "api", "s3", "file"]),
  owner: z.string().max(256).optional(),
  environment: z.enum(["development", "staging", "production", "sandbox"]).optional(),
  connection: ConnectionSchema.default({}),
  tags: z.array(z.string().min(1).max(64)).max(20).optional()
});

const UpdateSourceSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    owner: z.string().max(256).optional(),
    environment: z.enum(["development", "staging", "production", "sandbox"]).optional(),
    status: z.enum(["draft", "configured", "connected", "scanning", "failed", "disabled"]).optional(),
    connection: ConnectionSchema.optional(),
    tags: z.array(z.string().min(1).max(64)).max(20).optional(),
    lastCheckedAt: z.string().datetime().optional(),
    lastScanAt: z.string().datetime().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required" });

function toPublicSource(source: ManagedSource): ManagedSource {
  const { secretRef: _secretRef, ...connection } = source.connection;
  return {
    ...source,
    connection
  };
}

router.get("/sources", (_req, res) => {
  const items = sourceStore.list().map(toPublicSource);
  return res.json({ count: items.length, items });
});

router.post("/sources", async (req, res, next) => {
  const started = Date.now();
  const parsed = CreateSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid source payload", details: parsed.error.flatten() });
  }

  try {
    const item = await sourceStore.create(parsed.data);
    auditTrail.append({
      source: "api:sources",
      action: "source_create",
      status: "success",
      durationMs: Date.now() - started,
      metadata: { sourceId: item.id, type: item.type, status: item.status }
    });
    return res.status(201).json({ item: toPublicSource(item) });
  } catch (err) {
    return next(err);
  }
});

router.patch("/sources/:id", async (req, res, next) => {
  const parsed = UpdateSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid source payload", details: parsed.error.flatten() });
  }

  try {
    const item = await sourceStore.update(req.params.id, parsed.data);
    if (!item) return res.status(404).json({ error: "Source not found" });
    return res.json({ item: toPublicSource(item) });
  } catch (err) {
    return next(err);
  }
});

router.post("/sources/:id/check", async (req, res, next) => {
  try {
    const item = await sourceStore.markChecked(req.params.id, req.body?.ok !== false);
    if (!item) return res.status(404).json({ error: "Source not found" });
    return res.json({ item: toPublicSource(item) });
  } catch (err) {
    return next(err);
  }
});

export default router;
