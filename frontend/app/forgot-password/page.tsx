"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function forgotPassword(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setMessage("Password reset flow accepted. Check the configured Supabase/Auth email provider.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-8">
        <Badge>Forgot Password</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Reset account access</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Enter your email to start the configured password reset flow.</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Forgot Password</CardTitle>
          <CardDescription>In production this sends through Supabase/Auth email templates.</CardDescription>
        </CardHeader>
        <form onSubmit={forgotPassword} className="space-y-4">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <Button disabled={loading} className="w-full">{loading ? "Submitting..." : "Send reset link"}</Button>
        </form>
        <p className="mt-4 text-sm text-slate-400">
          Remembered your password? <Link href="/login" className="font-semibold text-blue-200">Back to login</Link>
        </p>
      </Card>

      {message ? <div className="mt-6 rounded-2xl border border-blue-400/30 bg-blue-400/10 p-4 text-sm text-blue-100">{message}</div> : null}
    </AppShell>
  );
}
