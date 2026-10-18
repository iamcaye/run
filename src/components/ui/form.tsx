import type { ComponentProps, ReactNode } from "react";

export function Field({ label, ...props }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent"
        {...props}
      />
    </label>
  );
}

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      className={`rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-foreground disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}
