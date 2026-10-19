import type { ReactNode } from "react";

// Form-style pages stay a readable column even inside the wide desktop container.
export function NarrowPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto flex w-full max-w-2xl flex-col gap-4${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
