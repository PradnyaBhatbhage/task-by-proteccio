"use client";

import type React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "./theme-provider";
import { cn } from "@/lib/utils";

const options: Array<{ value: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
];

export function ThemeToggle({ variant = "segmented" }: { variant?: "segmented" | "stacked" | "icons" }) {
  const { theme, setTheme } = useTheme();

  if (variant === "icons") {
    return (
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1.5">
        {options.map((option) => {
          const Icon = option.icon;
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "grid h-9 place-items-center rounded-xl text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]",
                active && "bg-[var(--accent-soft)] text-[var(--accent-text)]"
              )}
              aria-label={`Use ${option.label.toLowerCase()} theme`}
              aria-pressed={active}
              title={option.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "stacked") {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Theme</span>
          <span className="text-xs capitalize text-[var(--accent-text)]">{theme}</span>
        </div>
        <div className="grid gap-1.5">
          {options.map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]",
                  active && "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                )}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1">
      <div className="grid grid-cols-3 gap-1">
        {options.map((option) => {
          const Icon = option.icon;
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]",
                active && "bg-[var(--accent-soft)] text-[var(--accent-text)] shadow-sm"
              )}
              aria-pressed={active}
              title={`Use ${option.label.toLowerCase()} theme`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
