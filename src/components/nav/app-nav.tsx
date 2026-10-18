"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Plan, Log and Activities join as their phases land.
const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/goals", label: "Goals" },
  { href: "/settings", label: "Settings" },
] as const;

/** Bottom tab bar on phones, inline links on wider screens. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:static sm:border-0 sm:bg-transparent sm:pb-0"
    >
      <ul className="flex justify-around sm:justify-start sm:gap-4">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`block px-3 py-3 text-sm sm:py-1 ${active ? "font-semibold text-accent" : "text-muted"}`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
