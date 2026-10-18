import "server-only";
import { cache } from "react";
import { todayInTz, type LocalDate } from "@/lib/time";
import { requireUser, type CurrentUser } from "@/server/auth/session";
import { forUser, type Settings, type UserScope } from "@/server/dal";

export type UserContext = {
  user: CurrentUser;
  scope: UserScope;
  settings: Settings;
  /** Today in the user's timezone. */
  today: LocalDate;
};

/** Signed-in user + tenant-scoped DAL + settings. Redirects to sign-in without a session. */
export const requireUserContext = cache(async (): Promise<UserContext> => {
  const user = await requireUser();
  const scope = forUser(user.id);
  const settings = await scope.settings.get();
  return { user, scope, settings, today: todayInTz(settings.timezone) };
});
