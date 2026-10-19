"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { GoalsIcon, HomeIcon, PlanIcon, PlusIcon, RunsIcon, SettingsIcon } from "./icons";

// Phones get four tabs around a raised Log button; Goals is in the desktop nav and linked from the dashboard.
const LINKS: readonly { href: string; label: string; icon: () => ReactNode; mobile: boolean }[] = [
  { href: "/dashboard", label: "Home", icon: HomeIcon, mobile: true },
  { href: "/plan", label: "Plan", icon: PlanIcon, mobile: true },
  { href: "/activities", label: "Runs", icon: RunsIcon, mobile: true },
  { href: "/goals", label: "Goals", icon: GoalsIcon, mobile: false },
  { href: "/settings", label: "Settings", icon: SettingsIcon, mobile: true },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Bottom tab bar on phones, inline links on wider screens. */
export function AppNav({ variant }: { variant: "mobile" | "desktop" }) {
  const pathname = usePathname();

  if (variant === "desktop") {
    return (
      <nav aria-label="Main">
        <ul className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-lg px-3 py-1.5 text-sm ${active ? "bg-surface font-semibold text-accent" : "text-muted hover:text-foreground"}`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
          <li className="ml-2">
            <Link
              href="/log"
              aria-current={isActive(pathname, "/log") ? "page" : undefined}
              className="block rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
            >
              + Log
            </Link>
          </li>
        </ul>
      </nav>
    );
  }

  const tabs = LINKS.filter((l) => l.mobile);
  const tab = (l: (typeof tabs)[number]) => {
    const active = isActive(pathname, l.href);
    const Icon = l.icon;
    return (
      <li key={l.href}>
        <Link
          href={l.href}
          aria-current={active ? "page" : undefined}
          className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${active ? "font-bold text-accent" : "font-semibold text-muted"}`}
        >
          <Icon />
          {l.label}
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[1000] border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5 items-center">
        {tabs.slice(0, 2).map(tab)}
        <li className="flex justify-center">
          <Link
            href="/log"
            aria-label="Log a run"
            aria-current={isActive(pathname, "/log") ? "page" : undefined}
            className="-mt-6 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 transition-transform active:scale-95"
          >
            <PlusIcon />
          </Link>
        </li>
        {tabs.slice(2).map(tab)}
      </ul>
    </nav>
  );
}
