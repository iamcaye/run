"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/components/auth/auth-client";
import { Button, Field, FormError } from "@/components/ui/form";

export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("confirm") !== "DELETE") return setError("Type DELETE to confirm.");
    setPending(true);
    setError(null);
    const { error } = await authClient.deleteUser({ password: String(form.get("password")) });
    setPending(false);
    if (error) return setError(error.message ?? "Could not delete account");
    router.replace("/sign-up");
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start text-danger" onClick={() => setOpen(true)}>
        Delete account…
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-sm">
        This permanently deletes your account, goals, plans, activities, routes, import tokens and raw
        imports. It can&apos;t be undone.
      </p>
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <Field label='Type "DELETE" to confirm' name="confirm" autoComplete="off" required />
      <FormError>{error}</FormError>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
