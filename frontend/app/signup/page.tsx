"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, saveSession } from "@/lib/api";

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

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signup(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await apiFetch<AuthResponse>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, displayName, password })
      });
      saveSession(data);
      router.push("/dashboard");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>Signup</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Create your Proteccio account</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Self-service signup creates a viewer account. Super Admins can update roles later.</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Signup</CardTitle>
          <CardDescription>Use a valid email, display name, and strong password.</CardDescription>
        </CardHeader>
        <form onSubmit={signup} className="space-y-4">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new.user@example.com" required />
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" required />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="StrongPassword1!" required />
          <Button disabled={loading} className="w-full">{loading ? "Creating account..." : "Create account"}</Button>
        </form>
        <p className="mt-4 text-sm text-slate-400">
          Already have an account? <Link href="/login" className="font-semibold text-blue-200">Sign in</Link>
        </p>
      </Card>

      {message ? <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{message}</div> : null}
    </AppShell>
  );
}
