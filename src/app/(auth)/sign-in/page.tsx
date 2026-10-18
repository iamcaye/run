"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/components/auth/auth-client";
import { AuthCard, Button, Field, FormError } from "@/components/ui/form";

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) return setError(error.message ?? "Could not sign in");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <AuthCard title="Sign in">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormError>{error}</FormError>
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="flex justify-between text-sm text-muted">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/sign-up">Create account</Link>
      </div>
    </AuthCard>
  );
}
