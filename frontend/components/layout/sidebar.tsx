"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, ClipboardCheck, Database, FileSearch, FileText, GitBranch, Radar, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { getSession, type AuthSession } from "@/lib/api";
import { visibleNavItems } from "@/lib/authz";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "../theme-toggle";
import { AuthNav } from "../auth/auth-nav";

const icons: Record<string, LucideIcon> = {
  "/dashboard": BarChart3,
  "/sources": Database,
  "/discovery": Radar,
  "/mapping": GitBranch,
  "/compliance": ClipboardCheck,
  "/governance": ShieldCheck,
  "/search": FileSearch,
  "/reports": FileText,
  "/users": Users
};

export function Sidebar() {
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSession | null>(null);

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

  return (
    <aside className="glass-panel sticky top-0 hidden h-screen w-72 shrink-0 rounded-none p-5 lg:flex lg:flex-col">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 shadow-lg shadow-blue-500/20">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="font-semibold text-white">Proteccio</p>
          <p className="text-xs text-slate-400">Discover Console</p>
        </div>
      </div>

      <div className="mb-4">
        <ThemeToggle variant="icons" />
      </div>

      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-4">
        {visibleNavItems(session).map((item) => {
          const Icon = icons[item.href] ?? ShieldCheck;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-slate-800/70 hover:text-white",
                active && "bg-blue-500/15 text-blue-100 ring-1 ring-blue-400/20"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <AuthNav />
      </nav>

      <div className="mt-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <p className="text-sm font-semibold text-white">Week 4 Prototype</p>
        <p className="mt-1 text-xs text-slate-400">React, Next.js, Tailwind, RBAC, Supabase-ready APIs.</p>
      </div>
    </aside>
  );
}
