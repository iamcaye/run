import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AppNav } from "@/components/nav/app-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { requireUser } from "@/server/auth/session";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.match(/\p{L}/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex flex-1 flex-col">
      <header>
        <div className="mx-auto flex w-full max-w-3xl lg:max-w-7xl items-center justify-between gap-3 px-4 pt-4 pb-1">
          <Link href="/dashboard" aria-label="Race Training — home">
            <Wordmark className="text-[22px]" />
          </Link>
          <div className="hidden flex-1 justify-center sm:flex">
            <AppNav variant="desktop" />
          </div>
          <div className="flex min-w-0 items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">
              <SignOutButton />
            </span>
            <Link
              href="/settings"
              aria-label={`Account settings for ${user.name}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground font-condensed text-base font-bold text-foreground"
            >
              {initials(user.name) || "?"}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl lg:max-w-7xl flex-1 px-4 pt-4 pb-28 sm:pb-8">{children}</main>
      <div className="sm:hidden">
        <AppNav variant="mobile" />
      </div>
    </div>
  );
}
