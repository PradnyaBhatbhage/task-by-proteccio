export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3000";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export type AuthSession = {
  token: string;
  refreshToken?: string;
  user?: SessionUser;
  permissions?: string[];
};

const TOKEN_KEY = "proteccio.next.token";
const REFRESH_KEY = "proteccio.next.refresh";
const USER_KEY = "proteccio.next.user";
const PERMISSIONS_KEY = "proteccio.next.permissions";

export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const userRaw = window.localStorage.getItem(USER_KEY);
  const permissionsRaw = window.localStorage.getItem(PERMISSIONS_KEY);
  return {
    token,
    refreshToken: window.localStorage.getItem(REFRESH_KEY) || undefined,
    user: userRaw ? JSON.parse(userRaw) : undefined,
    permissions: permissionsRaw ? JSON.parse(permissionsRaw) : []
  };
}

export function saveSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, session.token);
  if (session.refreshToken) window.localStorage.setItem(REFRESH_KEY, session.refreshToken);
  if (session.user) window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  if (session.permissions) window.localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(session.permissions));
  window.dispatchEvent(new Event("proteccio:auth"));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(PERMISSIONS_KEY);
  window.dispatchEvent(new Event("proteccio:auth"));
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getSession();
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (session?.token) headers.set("Authorization", `Bearer ${session.token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function apiFormFetch<T>(path: string, formData: FormData, init?: Omit<RequestInit, "body">): Promise<T> {
  const session = getSession();
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (session?.token) headers.set("Authorization", `Bearer ${session.token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method: init?.method ?? "POST",
    body: formData,
    headers,
    cache: "no-store"
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed (${res.status})`);
  }
  return data as T;
}
