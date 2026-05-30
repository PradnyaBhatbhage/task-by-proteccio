"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, LockKeyhole } from "lucide-react";
import { apiFetch, clearSession, getSession } from "@/lib/api";
import { cn } from "@/lib/utils";

type AuthNavProps = {
  compact?: boolean;
};

export function AuthNav({ compact = false }: AuthNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const sync = () => setSignedIn(Boolean(getSession()?.token));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("proteccio:auth", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("proteccio:auth", sync);
    };
  }, [pathname]);

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Local JWT logout is client-side; still clear the session if the server call fails.
    }
    clearSession();
    window.dispatchEvent(new Event("proteccio:auth"));
    router.push("/login");
  }

  if (signedIn) {
    return (
      <button
        type="button"
        onClick={() => void logout()}
        className={
          compact
            ? "text-sm text-slate-300 hover:text-white"
            : "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-slate-800/70 hover:text-white"
        }
      >
        <LogOut className={compact ? "hidden" : "h-4 w-4"} />
        Logout
      </button>
    );
  }

  if (compact) {
    return (
      <Link href="/login" className="text-sm text-slate-300 hover:text-white">
        Login
      </Link>
    );
  }

  const active = pathname === "/login";
  return (
    <Link
      href="/login"
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-slate-800/70 hover:text-white",
        active && "bg-blue-500/15 text-blue-100 ring-1 ring-blue-400/20"
      )}
    >
      <LockKeyhole className="h-4 w-4" />
      Login
    </Link>
  );
}
