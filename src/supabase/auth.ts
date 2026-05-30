import type { User } from "@supabase/supabase-js";
import { ROLE_PERMISSIONS } from "../auth/permissions";
import type { AuthPrincipal, PublicUser, Role } from "../auth/types";
import { env } from "../config/env";
import { getSupabaseAdmin, getSupabaseAnon, isSupabaseAuthConfigured } from "./client";

interface ProfileRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function displayNameFor(user: User, fallbackEmail: string): string {
  const metadataName = user.user_metadata?.display_name;
  return typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim().slice(0, 128)
    : fallbackEmail.split("@")[0] || "Proteccio User";
}

function profileToPrincipal(profile: ProfileRow, user: User): AuthPrincipal {
  return {
    id: user.id,
    email: profile.email ?? user.email ?? user.id,
    displayName: profile.display_name ?? displayNameFor(user, user.email ?? user.id),
    role: profile.role,
    authMethod: "supabase"
  };
}

function profileToPublic(profile: ProfileRow): PublicUser {
  const now = nowIso();
  return {
    id: profile.user_id,
    email: profile.email ?? profile.user_id,
    displayName: profile.display_name ?? profile.email ?? "Proteccio User",
    role: profile.role,
    active: profile.active,
    createdAt: profile.created_at ?? now,
    updatedAt: profile.updated_at ?? now
  };
}

export function supabaseAuthEnabled(): boolean {
  return isSupabaseAuthConfigured();
}

export async function ensureSupabaseProfile(
  user: User,
  role: Role = "viewer",
  displayName?: string
): Promise<PublicUser | undefined> {
  const admin = getSupabaseAdmin();
  if (!admin || !user.email) return undefined;

  const { data: existing, error: readError } = await admin
    .from(env.SUPABASE_PROFILE_TABLE)
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<ProfileRow>();
  if (readError) throw readError;

  const row: ProfileRow = {
    user_id: user.id,
    email: user.email,
    display_name: displayName?.trim() || existing?.display_name || displayNameFor(user, user.email),
    role: existing?.role ?? role,
    active: existing?.active ?? true
  };

  const { data, error } = await admin
    .from(env.SUPABASE_PROFILE_TABLE)
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single<ProfileRow>();
  if (error) throw error;
  return profileToPublic(data);
}

export async function getSupabasePrincipal(accessToken: string): Promise<AuthPrincipal | undefined> {
  const admin = getSupabaseAdmin();
  if (!admin) return undefined;

  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData.user) return undefined;

  const { data: profile, error: profileError } = await admin
    .from(env.SUPABASE_PROFILE_TABLE)
    .select("*")
    .eq("user_id", userData.user.id)
    .maybeSingle<ProfileRow>();
  if (profileError) return undefined;

  const publicProfile = profile ? profileToPublic(profile) : await ensureSupabaseProfile(userData.user, "viewer");
  if (!publicProfile || !publicProfile.active) return undefined;

  return profileToPrincipal(
    {
      user_id: publicProfile.id,
      email: publicProfile.email,
      display_name: publicProfile.displayName,
      role: publicProfile.role,
      active: publicProfile.active,
      created_at: publicProfile.createdAt,
      updated_at: publicProfile.updatedAt
    },
    userData.user
  );
}

export async function signInWithSupabase(email: string, password: string) {
  const client = getSupabaseAnon();
  if (!client) return undefined;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    return { error: error?.message ?? "Supabase sign-in failed" };
  }

  const profile = await ensureSupabaseProfile(data.user);
  if (!profile) return { error: "Supabase profile could not be loaded" };
  return {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    user: profile,
    permissions: [...ROLE_PERMISSIONS[profile.role]]
  };
}

export async function signUpWithSupabase(email: string, password: string, displayName: string) {
  const admin = getSupabaseAdmin();
  const anon = getSupabaseAnon();
  if (!admin || !anon) return undefined;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName }
  });
  if (created.error || !created.data.user) {
    return { error: created.error?.message ?? "Supabase signup failed" };
  }

  await ensureSupabaseProfile(created.data.user, "viewer", displayName);
  return signInWithSupabase(email, password);
}

export async function resetPasswordWithSupabase(email: string): Promise<{ ok: boolean; error?: string } | undefined> {
  const client = getSupabaseAnon();
  if (!client) return undefined;
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: env.SUPABASE_AUTH_REDIRECT_URL
  });
  return { ok: !error, error: error?.message };
}

export async function refreshSupabaseSession(refreshToken: string) {
  const client = getSupabaseAnon();
  if (!client) return undefined;
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.user || !data.session) {
    return { error: error?.message ?? "Supabase session refresh failed" };
  }
  const profile = await ensureSupabaseProfile(data.user);
  if (!profile) return { error: "Supabase profile could not be loaded" };
  return {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    user: profile,
    permissions: [...ROLE_PERMISSIONS[profile.role]]
  };
}

export async function signOutSupabaseToken(accessToken: string): Promise<{ ok: boolean; error?: string } | undefined> {
  const admin = getSupabaseAdmin();
  if (!admin) return undefined;
  const { error } = await admin.auth.admin.signOut(accessToken, "local");
  return { ok: !error, error: error?.message };
}

export async function listSupabaseProfiles(): Promise<PublicUser[] | undefined> {
  const admin = getSupabaseAdmin();
  if (!admin) return undefined;
  const { data, error } = await admin
    .from(env.SUPABASE_PROFILE_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ProfileRow[]).map(profileToPublic);
}

export async function createSupabaseUser(input: {
  email: string;
  password: string;
  displayName: string;
  role: Role;
}): Promise<PublicUser | undefined> {
  const admin = getSupabaseAdmin();
  if (!admin) return undefined;
  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { display_name: input.displayName }
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? "Supabase user creation failed");
  }
  return ensureSupabaseProfile(created.data.user, input.role, input.displayName);
}

export async function updateSupabaseProfile(
  id: string,
  patch: Partial<Pick<PublicUser, "displayName" | "role" | "active">> & { password?: string }
): Promise<PublicUser | undefined> {
  const admin = getSupabaseAdmin();
  if (!admin) return undefined;

  if (patch.password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: patch.password });
    if (error) throw error;
  }

  const update: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.active !== undefined) update.active = patch.active;

  const { data, error } = await admin
    .from(env.SUPABASE_PROFILE_TABLE)
    .update(update)
    .eq("user_id", id)
    .select("*")
    .maybeSingle<ProfileRow>();
  if (error) throw error;
  return data ? profileToPublic(data) : undefined;
}
