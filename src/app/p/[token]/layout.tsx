import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/wordmark";

// Every /p page is private-by-link: keep them out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SharedPlanLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-3xl px-4 pt-4 pb-1">
        <Wordmark className="text-[22px]" />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-8">{children}</main>
    </div>
  );
}
