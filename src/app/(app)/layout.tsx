import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireUser } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-semibold">Race Training</span>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="truncate">{user.name}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
