"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Wordmark } from "./wordmark";

const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 aria-invalid:border-danger";

function FieldShell({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error?.length ? <span className="text-muted">{hint}</span> : null}
      {error?.length ? <span className="text-danger">{error[0]}</span> : null}
    </label>
  );
}

type FieldExtras = { label: string; hint?: ReactNode; error?: string[] };

export function Field({ label, hint, error, ...props }: FieldExtras & ComponentProps<"input">) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <input className={inputClass} aria-invalid={error?.length ? true : undefined} {...props} />
    </FieldShell>
  );
}

export function Select({
  label,
  hint,
  error,
  options,
  ...props
}: FieldExtras & { options: readonly { value: string; label: string }[] } & ComponentProps<"select">) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <select className={inputClass} aria-invalid={error?.length ? true : undefined} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Textarea({ label, hint, error, ...props }: FieldExtras & ComponentProps<"textarea">) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <textarea className={inputClass} rows={3} aria-invalid={error?.length ? true : undefined} {...props} />
    </FieldShell>
  );
}

/** Toggle-chip group backed by checkboxes sharing one `name` (read with formData.getAll). */
export function ChipGroup({
  label,
  name,
  options,
  defaultValues,
  error,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValues: readonly string[];
  error?: string[];
}) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1 font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={defaultValues.includes(o.value)}
              className="peer sr-only"
            />
            <span className="inline-block rounded-full border border-border bg-surface px-3 py-1.5 font-medium peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {error?.length ? <span className="text-danger">{error[0]}</span> : null}
    </fieldset>
  );
}

export function Checkbox({ label, ...props }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-accent" {...props} />
      {label}
    </label>
  );
}

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ink" | "danger" }) {
  const styles = {
    primary: "bg-accent text-accent-foreground",
    secondary: "border border-border bg-surface",
    ink: "bg-foreground text-background",
    danger: "bg-danger text-white",
  }[variant];
  return (
    <button
      className={`rounded-xl px-4 py-2.5 font-semibold transition-transform active:scale-[0.98] disabled:opacity-60 ${styles} ${className}`}
      {...props}
    />
  );
}

/** Submit button that disables itself while pending (explicit `pending`, or the form's action status). */
export function SubmitButton({
  children,
  pendingLabel,
  pending: pendingProp,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
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

export function FormSuccess({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="text-sm text-muted">
      {children}
    </p>
  );
}

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <Wordmark className="text-2xl" />
      <h1 className="font-condensed text-4xl font-extrabold uppercase">{title}</h1>
      {children}
    </main>
  );
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[20px] bg-surface p-4">
      {title || action ? (
        <div className="flex items-baseline justify-between gap-2">
          {title ? <h2 className="font-condensed text-xl font-extrabold uppercase">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
