"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_BASE_URL, apiFetch, saveSession } from "@/lib/api";

type AuthResponse = {
  token: string;
  refreshToken?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
  permissions?: string[];
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("superadmin@local");
  const [password, setPassword] = useState("SuperAdmin1!");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await apiFetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      saveSession(data);
      router.push("/dashboard");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>Authentication</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Secure access for privacy teams</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Login, signup, password reset, session storage, and RBAC permissions are wired to the existing Proteccio API at{" "}
          <span className="text-slate-200">{API_BASE_URL}</span>.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>Use a seeded demo user locally or a Supabase-authenticated account in production.</CardDescription>
          </CardHeader>
          <form onSubmit={login} className="space-y-4">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="superadmin@local" />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            <Button disabled={loading} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Help</CardTitle>
            <CardDescription>Create a viewer account or start a password reset flow from dedicated pages.</CardDescription>
          </CardHeader>
          <div className="grid gap-3">
            <Link href="/signup"><Button variant="secondary" className="w-full">Signup</Button></Link>
            <Link href="/forgot-password"><Button variant="ghost" className="w-full">Forgot password</Button></Link>
          </div>
        </Card>
      </div>

      {message ? <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{message}</div> : null}
    </AppShell>
  );
}
