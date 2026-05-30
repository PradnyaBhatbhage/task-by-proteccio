"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthNav } from "@/components/auth/auth-nav";
import { getSession, type AuthSession } from "@/lib/api";
import { cn } from "@/lib/utils";
import { visibleNavItems } from "@/lib/authz";

export function MobileNav() {
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
    <nav className="flex max-w-full gap-3 overflow-x-auto text-sm text-slate-300">
      {visibleNavItems(session).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn("whitespace-nowrap hover:text-white", pathname === item.href && "text-blue-100")}
        >
          {item.label}
        </Link>
      ))}
      <AuthNav compact />
    </nav>
  );
}
