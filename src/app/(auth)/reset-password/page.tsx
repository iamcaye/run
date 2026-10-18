"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { authClient } from "@/components/auth/auth-client";
import { AuthCard, Button, Field, FormError } from "@/components/ui/form";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(
    params.get("error") ? "This reset link is invalid or has expired." : null,
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({
      token,
      newPassword: String(form.get("password")),
    });
    setPending(false);
    if (error) return setError(error.message ?? "Could not reset password");
    router.replace("/sign-in?reset=1");
  }

  if (!token) {
    return (
      <>
        <FormError>{error ?? "Missing reset token."}</FormError>
        <Link href="/forgot-password" className="text-sm">
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <FormError>{error}</FormError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
