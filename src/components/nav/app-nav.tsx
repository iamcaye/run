"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Five tabs fit a phone's bottom bar; Goals is in the desktop nav and linked from the dashboard.
const LINKS = [
  { href: "/dashboard", label: "Dashboard", mobile: true },
  { href: "/plan", label: "Plan", mobile: true },
  { href: "/log", label: "Log", mobile: true },
  { href: "/activities", label: "Runs", mobile: true },
  { href: "/goals", label: "Goals", mobile: false },
  { href: "/settings", label: "Settings", mobile: true },
] as const;

/** Bottom tab bar on phones, inline links on wider screens. */
export function AppNav({ variant }: { variant: "mobile" | "desktop" }) {
  const pathname = usePathname();
  const links = variant === "mobile" ? LINKS.filter((l) => l.mobile) : LINKS;
  return (
    <nav
      aria-label="Main"
      className={
        variant === "mobile"
          ? "fixed inset-x-0 bottom-0 z-[1000] border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
          : ""
      }
    >
      <ul className={variant === "mobile" ? "flex justify-around" : "flex gap-1"}>
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`block px-3 text-sm ${variant === "mobile" ? "py-3" : "py-1"} ${active ? "font-semibold text-accent" : "text-muted"}`}
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
