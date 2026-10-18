import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AppNav } from "@/components/nav/app-nav";
import { requireUser } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            Race Training
          </Link>
          <div className="hidden flex-1 sm:block">
            <AppNav />
          </div>
          <div className="flex min-w-0 items-center gap-3 text-sm text-muted">
            <span className="truncate">{user.name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-24 sm:pb-6">{children}</main>
      <div className="sm:hidden">
        <AppNav />
      </div>
    </div>
  );
}
