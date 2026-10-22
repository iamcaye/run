import "server-only";
import pLimit from "p-limit";
import { SHARING, WORKOUT_LIMITS } from "@/config/training";
import { isLocalDate, todayInTz, type LocalDate } from "@/lib/time";
import { forUser, type CustomPlan, type UserScope } from "@/server/dal";
import { followFromToken, generateShareToken, listActiveFollowers } from "@/server/system/shared-plans";
import { activateFollow, catchUpActiveFollow, resolveFollowSource } from "./training";

export type ShareState = { shareToken: string | null; shareEnabled: boolean };

/**
 * Turns the plan's share link on or off. `enable` reuses the existing token (or makes the first one);
 * `regenerate` replaces it, so the old link stops working, and enables sharing. Null when the plan
 * isn't the user's.
 */
export async function updatePlanShare(
  scope: UserScope,
  planId: string,
  op: "enable" | "disable" | "regenerate",
): Promise<ShareState | null> {
  const plan = await scope.customPlans.get(planId);
  if (!plan) return null;
  switch (op) {
    case "enable":
      return scope.customPlans.setShare(planId, {
        shareEnabled: true,
        ...(plan.shareToken ? {} : { shareToken: generateShareToken() }),
      });
    case "disable":
      return scope.customPlans.setShare(planId, { shareEnabled: false });
    case "regenerate":
      return scope.customPlans.setShare(planId, { shareToken: generateShareToken(), shareEnabled: true });
  }
}

export type FollowSharedResult =
  | { ok: true; kind: "own"; planId: string }
  | { ok: true; kind: "follow"; followId: string; activated: boolean }
  | { ok: false; code: "inactive" | "invalid"; message: string };

const linkInactive = { ok: false, code: "inactive", message: "This plan isn't shared anymore" } as const;

/**
 * Follows the plan behind a share link (the author's own link just points back to their plan) and,
 * with `activate`, makes it the active plan from `startDate`.
 */
export async function followSharedPlan(
  scope: UserScope,
  token: string,
  opts: { activate: boolean; startDate: LocalDate },
  today: LocalDate,
): Promise<FollowSharedResult> {
  if (opts.activate && (!isLocalDate(opts.startDate) || opts.startDate < today)) {
    return { ok: false, code: "invalid", message: "Pick a start date on or after today" };
  }
  const followed = await followFromToken(scope.userId, token);
  if (followed.kind === "inactive") return linkInactive;
  if (followed.kind === "own") return { ok: true, kind: "own", planId: followed.planId };

  const followId = followed.follow.id;
  if (!opts.activate) return { ok: true, kind: "follow", followId, activated: false };
  const activated = await activateFollow(scope, followId, opts.startDate, today);
  if (!activated.ok) return activated.code === "not_found" ? linkInactive : { ok: false, code: "invalid", message: activated.message };
  return { ok: true, kind: "follow", followId, activated: true };
}

const COPY_SUFFIX = " (copy)";

/** Copies a followed plan (live, or its snapshot once detached) into a new plan of the user's own. */
export async function duplicateFollowedPlan(scope: UserScope, followId: string): Promise<CustomPlan | null> {
  const follow = await scope.planFollows.get(followId);
  if (!follow) return null;
  const source = await resolveFollowSource(scope, follow);
  const name = `${source.planName.slice(0, WORKOUT_LIMITS.nameMax - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;
  const created = await scope.customPlans.create({ name, description: source.description });
  const saved = await scope.customPlans.save(
    created.id,
    { name, description: source.description, doc: source.doc },
    created.version,
  );
  if (!saved || saved === "conflict") throw new Error("Failed to save duplicated plan");
  return saved;
}

/** Best effort, for `after()`: each active follower (in their own time zone) is synced with notify; failures are logged per follower. */
export async function propagatePlanUpdate(planId: string, authorId: string): Promise<void> {
  const followers = await listActiveFollowers(planId, authorId);
  const limit = pLimit(SHARING.propagateConcurrency);
  await Promise.all(
    followers.map(({ userId, followId }) =>
      limit(async () => {
        try {
          const scope = forUser(userId);
          const settings = await scope.settings.get();
          await catchUpActiveFollow(scope, todayInTz(settings.timezone));
        } catch (err) {
          console.error("plan update propagation failed", { planId, followId, err });
        }
      }),
    ),
  );
}
