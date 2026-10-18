"use client";

import { useRouter } from "next/navigation";
import { authClient } from "./auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="underline-offset-2 hover:underline"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
