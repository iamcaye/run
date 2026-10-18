"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/components/auth/auth-client";
import { AuthCard, Button, Field, FormError } from "@/components/ui/form";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get("email")),
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error) return setError(error.message ?? "Something went wrong");
    setSent(true);
  }

  return (
    <AuthCard title="Reset password">
      {sent ? (
        <p className="text-sm">
          If an account exists for that email, we&apos;ve sent a link to reset your password.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <FormError>{error}</FormError>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <Link href="/sign-in" className="text-sm text-muted">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
