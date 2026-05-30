"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession, type AuthSession } from "@/lib/api";
import { hasPermission, PUBLIC_PATHS, requiredPermissionForPath } from "@/lib/authz";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setSession(getSession());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("proteccio:auth", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("proteccio:auth", sync);
    };
  }, [pathname]);

  useEffect(() => {
    if (session === undefined) return;
    const isPublic = PUBLIC_PATHS.has(pathname);
    if (!session?.token && !isPublic) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
    if (session?.token && (pathname === "/login" || pathname === "/signup")) {
      router.replace("/dashboard");
    }
  }, [pathname, router, session]);

  if (session === undefined) {
    return <GuardMessage title="Loading secure workspace" description="Checking your local session before rendering this page." />;
  }

  if (!session?.token && !PUBLIC_PATHS.has(pathname)) {
    return <GuardMessage title="Authentication required" description="Redirecting to login..." />;
  }

  const required = requiredPermissionForPath(pathname);
  if (session?.token && !hasPermission(session, required)) {
    return (
      <GuardMessage
        title="Access restricted"
        description="Your current role does not have permission to view this workspace area."
      />
    );
  }

  return <>{children}</>;
}

function GuardMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
