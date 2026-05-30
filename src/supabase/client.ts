import { env } from "../config/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseStatus {
  configured: boolean;
  required: boolean;
  url?: string;
  sourceTable: string;
  eventTable: string;
  profileTable: string;
  discoveryTable: string;
  fileTable: string;
  storageBucket: string;
  mode: "service_role" | "anon" | "disabled";
  reachable?: boolean;
  message: string;
}

export interface SupabaseSyncResult {
  enabled: boolean;
  ok: boolean;
  table?: string;
  error?: string;
}

function serviceKey(): string | undefined {
  return env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_ANON_KEY?.trim() || undefined;
}

let adminClient: SupabaseClient | undefined;
let anonClient: SupabaseClient | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(env.SUPABASE_URL?.trim() && serviceKey());
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_ANON_KEY?.trim());
}

export function getSupabaseAdmin(): SupabaseClient | undefined {
  if (!env.SUPABASE_URL || !serviceKey()) return undefined;
  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, serviceKey()!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return adminClient;
}

export function getSupabaseAnon(): SupabaseClient | undefined {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return undefined;
  if (!anonClient) {
    anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return anonClient;
}

function restUrl(table?: string): string {
  const base = env.SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) throw new Error("SUPABASE_URL is not configured");
  return table ? `${base}/rest/v1/${table}` : `${base}/rest/v1/`;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const key = serviceKey();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is not configured");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

export async function getSupabaseStatus(): Promise<SupabaseStatus> {
  const configured = isSupabaseConfigured();
  const base: SupabaseStatus = {
    configured,
    required: env.SUPABASE_REQUIRED,
    url: env.SUPABASE_URL,
    sourceTable: env.SUPABASE_SOURCE_TABLE,
    eventTable: env.SUPABASE_EVENT_TABLE,
    profileTable: env.SUPABASE_PROFILE_TABLE,
    discoveryTable: env.SUPABASE_DISCOVERY_TABLE,
    fileTable: env.SUPABASE_FILE_TABLE,
    storageBucket: env.SUPABASE_STORAGE_BUCKET,
    mode: env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : env.SUPABASE_ANON_KEY ? "anon" : "disabled",
    message: configured
      ? "Supabase credentials are configured; REST persistence is available."
      : "Supabase credentials are not configured; prototype is running with local in-memory stores."
  };

  if (!configured) return base;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(restUrl(), {
      method: "GET",
      headers: headers({ Accept: "application/json" }),
      signal: controller.signal
    });
    return {
      ...base,
      reachable: res.ok,
      message: res.ok
        ? "Supabase REST endpoint is reachable."
        : `Supabase REST endpoint responded with ${res.status}. Check keys, RLS policies, and project URL.`
    };
  } catch (err) {
    return {
      ...base,
      reachable: false,
      message: err instanceof Error ? `Supabase check failed: ${err.message}` : "Supabase check failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function upsertSupabaseRow(
  table: string,
  row: Record<string, unknown>,
  conflictColumn = "id"
): Promise<SupabaseSyncResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { enabled: false, ok: true, table };
  }

  try {
    const { error } = await admin.from(table).upsert(row, {
      onConflict: conflictColumn,
      ignoreDuplicates: false
    });
    if (error) {
      return { enabled: true, ok: false, table, error: error.message };
    }
    return { enabled: true, ok: true, table };
  } catch (err) {
    return {
      enabled: true,
      ok: false,
      table,
      error: err instanceof Error ? err.message : "Supabase upsert failed"
    };
  }
}

export async function publishPlatformEvent(
  eventType: string,
  payload: Record<string, unknown>
): Promise<SupabaseSyncResult> {
  return upsertSupabaseRow(env.SUPABASE_EVENT_TABLE, {
    id: `${eventType}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    event_type: eventType,
    payload,
    created_at: new Date().toISOString()
  });
}
