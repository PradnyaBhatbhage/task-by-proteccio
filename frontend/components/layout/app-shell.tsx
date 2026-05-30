import Link from "next/link";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "../theme-toggle";
import { RouteGuard } from "../auth/route-guard";
import { MobileNav } from "./mobile-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard>
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:hidden">
        <Link href="/dashboard" className="text-base font-semibold text-white">
          Proteccio Discover
        </Link>
        <div className="flex items-center gap-3">
          <MobileNav />
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-4 sm:px-6 lg:py-0 lg:pl-0 lg:pr-8">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-12">{children}</main>
      </div>
    </RouteGuard>
  );
}
