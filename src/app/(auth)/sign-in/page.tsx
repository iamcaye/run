"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { authClient } from "@/components/auth/auth-client";
import { AuthCard, Button, Field, FormError } from "@/components/ui/form";
import { isShareToken, safeNextPath } from "@/lib/custom-plans/share";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const planToken = next?.split("/")[2];
  const signUpHref = isShareToken(planToken) ? `/sign-up?plan=${planToken}` : "/sign-up";

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
    router.replace(next ?? "/dashboard");
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
        <Link href={signUpHref}>Create account</Link>
      </div>
    </AuthCard>
  );
}
