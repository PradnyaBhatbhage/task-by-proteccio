"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { titleize } from "@/lib/format";

type UserRow = { id: string; email: string; displayName: string; role: string; active?: boolean; createdAt?: string };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", displayName: "", password: "", role: "viewer" });

  async function load() {
    try {
      setLoading(true);
      const data = await apiFetch<{ items: UserRow[] }>("/api/auth/users");
      setUsers(data.items || []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Only super admins can manage users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      await apiFetch("/api/auth/users", { method: "POST", body: JSON.stringify(form) });
      setMessage("User created successfully.");
      setForm({ email: "", displayName: "", password: "", role: "viewer" });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "User creation failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>User Management</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">RBAC users and roles</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Create evaluator accounts and assign Super Admin, Privacy Admin, Security Analyst, Auditor, or Viewer access.</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle>Create User</CardTitle><CardDescription>Available to Super Admin only.</CardDescription></CardHeader>
          <form onSubmit={create} className="grid gap-4">
            <Input type="email" placeholder="analyst@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input placeholder="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
            <Input type="password" placeholder="StrongPassword1!" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="viewer">Viewer</option><option value="auditor">Auditor</option><option value="security_analyst">Security Analyst</option><option value="privacy_admin">Privacy Admin</option><option value="super_admin">Super Admin</option>
            </Select>
            <Button disabled={creating}>{creating ? "Creating..." : "Create user"}</Button>
          </form>
          {message ? <p className="mt-4 text-sm text-blue-100">{message}</p> : null}
        </Card>

        <Card>
          <CardHeader><CardTitle>Users</CardTitle><CardDescription>Current local or Supabase-backed profiles.</CardDescription></CardHeader>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400"><tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Created</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={4} className="p-6 text-center text-slate-500">Loading users...</td></tr> : users.length ? users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-800"><td className="p-3"><p className="font-medium text-white">{u.displayName || u.email}</p><p className="text-xs text-slate-500">{u.email}</p></td><td className="p-3 text-slate-300">{titleize(u.role)}</td><td className="p-3 text-slate-300">{u.active === false ? "Disabled" : "Active"}</td><td className="p-3 text-slate-300">{u.createdAt || "-"}</td></tr>
                )) : <tr><td colSpan={4} className="p-6 text-center text-slate-500">No users loaded.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
