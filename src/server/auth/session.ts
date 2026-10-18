import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export type CurrentUser = { id: string; name: string; email: string };

/** The signed-in user, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await auth().api.getSession({ headers: await headers() });
  if (!result) return null;
  const { id, name, email } = result.user;
  return { id, name, email };
});

/** Use in protected pages/actions: redirects to sign-in when there's no session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
