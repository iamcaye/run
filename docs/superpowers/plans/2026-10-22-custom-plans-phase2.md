# Custom Plans — Phase 2 (share plans) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An author can share a custom plan by link; anyone can view it without an account, follow it (logged in, or via sign-up + onboarding that starts them on it), see it under "Shared with me", duplicate it, and receive the author's later changes with a notice.

**Architecture:** A plan gets one reusable, revocable share token stored on `custom_plan`. Follows of someone else's plan reuse the Phase 1 `plan_follow` row (follower-owned, snapshot kept, `custom_plan_id` set null when the plan or author goes), so a detached copy falls out of the existing model. Cross-user reads (public page by token, follower reading the live plan) live in one tested module, `src/server/system/shared-plans.ts`. Each grant check sits next to its query there. Propagation runs eagerly after the author's save (`after()`) and lazily as a catch-up when the follower opens dashboard/plan. Both paths go through one optimistic `applySync` transaction (guarded by a `sync_seq` counter), which also merges a per-follow update notice.

**Tech Stack:** Next.js 16 App Router (server actions, `after`), React 19, TypeScript strict, Drizzle + Postgres, Zod 4, Tailwind 4, Vitest (+ fast-check), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-custom-plans-sharing-design.md`. This plan covers **Phase 2** only. Progress-sharing levels at follow time are Phase 3, so the follow screens here have no sharing choice.

## Global Constraints

- Work on branch **`feat/custom-plans`** (same branch as Phase 1). Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (AGENTS.md). In particular: `01-app/03-api-reference/04-functions/after.md`, and the `useSearchParams` guidance (Suspense requirement) before touching the auth pages.
- Same-user access goes through `forUser(userId)`. **Cross-user reads only in `src/server/system/shared-plans.ts`**. Every function there takes the grant (token, or the follower id + plan id whose `plan_follow` row is the grant) and is covered by `src/test/tenancy.test.ts`.
- Public plan data is exactly: plan name, description, doc (weeks), week count, author display name. **Never** author email, id in HTML, activities or other plans (spec anti-goal).
- Every new app table has `user_id` cascading on user delete.
- Tunable numbers in `src/config/training.ts`: add `export const SHARING = { tokenBytes: 16, propagateConcurrency: 4 } as const;`.
- Frozen sessions (date < follower's today, linked activity, `isUserEdited`) are never touched by propagation.
- No progress data, no levels, no "My athletes" (Phase 3).
- UI copy English, Pista look, `lg` desktop breakpoint, no new navigation pattern.
- Users who never share see no behaviour change. Phase 1 own-plan flows keep passing their tests.

## Review Focus

1. **Two syncs racing for one follower** (author saves twice quickly, or the eager propagation and the follower's dashboard catch-up overlap) → no duplicated sessions on a day, and no lost update. (Task 3 test `applySync rejects a stale sequence`, Task 4 test `concurrent syncs leave one session per day`.)
2. **Follower hand-edited a session or already ran it**, then the author changes that day → the follower's session is untouched and the notice does not list it. (Task 4 test `author update keeps frozen sessions and omits them from the notice`.)
3. **Author disables or regenerates the link after people followed** → existing followers still sync and can open their copy; the old URL shows "Link no longer active" and can't be followed. (Task 2 tenancy tests, Task 6 page test via e2e step.)
4. **Author deletes the plan or their account** → followers keep sessions and activities. "Shared with me" shows the plan with "No longer updated", and it can still be activated (from the snapshot) and duplicated. (Task 4 test `detached follow activates from snapshot`, Task 2 cascade test.)
5. **Hostile or stale `next`/`plan` parameters**: `?next=https://evil.com`, `?next=//evil.com`, a malformed token, or a link disabled mid-onboarding → no open redirect; onboarding falls back to the normal "First goal" path with a message. (Task 1 `safeNextPath` tests, Task 7 test.)

---

## File Structure

```
src/config/training.ts                    MODIFY  SHARING
src/server/db/schema/app.ts               MODIFY  custom_plan share cols; plan_follow author/sync cols; plan_update_notice
drizzle/0003_plan_sharing.sql             CREATE  generated + backfill
src/lib/custom-plans/share.ts             CREATE  token/link helpers (pure)
src/lib/custom-plans/changes.ts           CREATE  session change summary, merge, headline (pure)
src/lib/custom-plans/{share,changes}.test.ts CREATE
src/server/system/shared-plans.ts         CREATE  cross-user reads by token / follow grant
src/server/dal/custom-plans.ts            MODIFY  setShare
src/server/dal/plan-follows.ts            MODIFY  listShared, applySync, upsertForPlan sets author
src/server/dal/plan-notices.ts            CREATE  listOpen, dismiss
src/server/dal/{index,types}.ts           MODIFY
src/services/training.ts                  MODIFY  resolveFollowSource, activateFollow, versioned sync, catch-up
src/services/sharing.ts                   CREATE  share link ops, follow by token, duplicate, propagate
src/server/actions/custom-plans.ts        MODIFY  propagate after save; share, follow, duplicate, dismiss actions
src/server/actions/onboarding.ts          MODIFY  plan-aware steps
src/components/custom-plans/share-dialog.tsx      CREATE
src/components/custom-plans/plan-read-only.tsx    CREATE  public/preview/shared view
src/components/custom-plans/activate-dialog.tsx   MODIFY  takes an action
src/components/custom-plans/follow-form.tsx       CREATE  start date + Activate now
src/components/custom-plans/plan-update-card.tsx  CREATE  notice card
src/app/p/[token]/page.tsx                CREATE  public page
src/app/p/[token]/follow/page.tsx         CREATE  logged-in follow confirm
src/app/(app)/plans/[id]/preview/page.tsx CREATE
src/app/(app)/plans/shared/[followId]/page.tsx CREATE
src/app/(app)/plans/page.tsx              MODIFY  Shared with me
src/app/(app)/onboarding/page.tsx         MODIFY  "Start this plan" flow
src/app/(auth)/sign-in/page.tsx, sign-up/page.tsx MODIFY  carry next/plan
src/app/(app)/dashboard/page.tsx, plan/page.tsx, src/services/dashboard.ts MODIFY  catch-up + notices
e2e/share-plan.spec.ts                    CREATE
docs/decisions.md                         MODIFY
```

---

### Task 1: Pure helpers: share links and change summaries

**Files:**
- Create: `src/lib/custom-plans/share.ts`, `src/lib/custom-plans/changes.ts`
- Test: `src/lib/custom-plans/share.test.ts`, `src/lib/custom-plans/changes.test.ts`

**Interfaces:**
- Produces (`share.ts`):
  ```ts
  export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;   // 16 random bytes, base64url
  export function isShareToken(v: unknown): v is string;
  export const sharePath = (token: string) => `/p/${token}`;
  export const followPath = (token: string) => `/p/${token}/follow`;
  /** Only `/p/<token>/follow` (the one post-auth destination we hand out); anything else → null. */
  export function safeNextPath(raw: unknown): string | null;
  ```
- Produces (`changes.ts`):
  ```ts
  export type SessionBrief = { type: SessionType; km: number };
  export type PlanChange = { date: LocalDate; week: number /* 1-based */; before: SessionBrief | null; after: SessionBrief | null };
  export type SyncedSession = { date: LocalDate; weekIndex: number; type: SessionType; targetKm: number; structure: { steps: StructureStep[] } | null };
  /** Pairs removed and added sessions by date; drops pairs whose type, km and steps are equal. Sorted by date. */
  export function sessionChanges(removed: readonly SyncedSession[], added: readonly SyncedSession[]): PlanChange[];
  /** Same date: keep the oldest `before`, newest `after`; drop entries that end equal (before≈after or both null). */
  export function mergeChanges(older: readonly PlanChange[], newer: readonly PlanChange[]): PlanChange[];
  export function noticeHeadline(authorName: string, changes: readonly PlanChange[]): string;
  ```
  `SessionDraft` (Phase 1) is assignable to `SyncedSession`, and so is a `PlannedSession`.

- [ ] **Step 1: Write failing tests**

`share.test.ts`:
```ts
it("accepts only 22-char base64url tokens", () => {
  expect(isShareToken("abcdefghijklmnopqrstuv")).toBe(true);
  expect(isShareToken("abc")).toBe(false);
  expect(isShareToken("abcdefghijklmnopqrst/v")).toBe(false);
});
it("safeNextPath allows only follow paths", () => {
  const t = "abcdefghijklmnopqrstuv";
  expect(safeNextPath(`/p/${t}/follow`)).toBe(`/p/${t}/follow`);
  for (const bad of ["https://evil.com", "//evil.com", `/p/${t}/follow/../../x`, "/dashboard", `/p/${t}`, null, 42])
    expect(safeNextPath(bad)).toBeNull();
});
```
`changes.test.ts`:
```ts
const s = (date: string, type: SessionType, km: number, weekIndex = 2): SyncedSession =>
  ({ date, weekIndex, type, targetKm: km, structure: { steps: [{ kind: "steady", km }] } });
it("pairs by date and drops unchanged days", () => {
  const removed = [s("2026-11-10", "easy", 8), s("2026-11-12", "tempo", 10), s("2026-11-14", "long", 16)];
  const added = [s("2026-11-10", "easy", 8), s("2026-11-12", "intervals", 11), s("2026-11-15", "easy", 6)];
  expect(sessionChanges(removed, added)).toEqual([
    { date: "2026-11-12", week: 3, before: { type: "tempo", km: 10 }, after: { type: "intervals", km: 11 } },
    { date: "2026-11-14", week: 3, before: { type: "long", km: 16 }, after: null },
    { date: "2026-11-15", week: 3, before: null, after: { type: "easy", km: 6 } },
  ]);
});
it("merge keeps the oldest before and newest after, and drops round trips", () => {
  const a = [{ date: "2026-11-12", week: 3, before: { type: "tempo", km: 10 }, after: { type: "easy", km: 6 } }];
  const b = [{ date: "2026-11-12", week: 3, before: { type: "easy", km: 6 }, after: { type: "tempo", km: 10 } }];
  expect(mergeChanges(a, b)).toEqual([]);
});
it("headline names one week or counts weeks", () => {
  expect(noticeHeadline("Ana", [chg(3), chg(3)])).toBe("Ana updated your plan: 2 sessions in week 3 changed");
  expect(noticeHeadline("Ana", [chg(3)])).toBe("Ana updated your plan: 1 session in week 3 changed");
  expect(noticeHeadline("Ana", [chg(3), chg(4)])).toBe("Ana updated your plan: 2 sessions changed across 2 weeks");
});
```
(`chg(w)` builds a `PlanChange` with a distinct date in week `w`.) Add a fast-check property: for random `older`/`newer`, `mergeChanges(older, newer)` has no two entries with the same date and no entry with `before` deep-equal to `after`.

- [ ] **Step 2: Run** `pnpm test:unit src/lib/custom-plans` → FAIL (modules missing).
- [ ] **Step 3: Implement** both files. Steps equality uses `JSON.stringify` of `structure?.steps ?? null` plus `type` and `targetKm`.
- [ ] **Step 4: Run** `pnpm test:unit src/lib/custom-plans && pnpm lint` → PASS.
- [ ] **Step 5: Commit** `feat(plans): share link and plan change helpers`

---

### Task 2: Schema, migration and the cross-user read module

**Files:**
- Modify: `src/server/db/schema/app.ts`, `src/config/training.ts`, `src/server/dal/types.ts`, `src/test/factories.ts`
- Create: `drizzle/0003_plan_sharing.sql` (via `pnpm db:generate`, then append backfill), `src/server/system/shared-plans.ts`
- Test: `src/test/tenancy.test.ts`

**Interfaces:**
- Schema:
  - `custom_plan`: `shareToken text unique null`, `shareEnabled boolean not null default false`.
  - `plan_follow`: `authorId text null references user(id) on delete set null`, `authorName text null` (null for own plans; kept after the author is gone), `snapshotVersion integer not null default 0`, `syncSeq integer not null default 0`.
  - New `plan_update_notice`: `id`, `userId()`, `followId uuid not null references plan_follow on delete cascade`, `authorName text not null`, `changes jsonb $type<PlanChange[]> not null`, `createdAt`, `updatedAt`, `dismissedAt timestamptz null`. Partial unique index `plan_update_notice_one_open` on `(follow_id) where dismissed_at is null`.
  - Backfill in the migration: `update plan_follow set author_id = user_id;` (Phase 1 follows are all own plans).
- Types: `PlanNotice = InferSelectModel<typeof s.planUpdateNotice>`.
- Produces (`src/server/system/shared-plans.ts`, raw `db()`, header comment says why it is cross-tenant like `system/import-tokens.ts`):
  ```ts
  export type SharedPlan = { planId: string; authorId: string; authorName: string; name: string; description: string | null; doc: CustomPlanDoc; version: number };
  export type FollowedPlan = Omit<SharedPlan, "planId" | "authorId">;
  export function generateShareToken(): string;                       // randomBytes(SHARING.tokenBytes).toString("base64url")
  /** Enabled links only; unknown, disabled or malformed tokens → null. */
  export function findSharedPlan(token: string): Promise<SharedPlan | null>;
  /** Grant = a plan_follow row (followerId, planId). Ignores shareEnabled: existing followers keep access. */
  export function readFollowedPlan(followerId: string, planId: string): Promise<FollowedPlan | null>;
  export type FollowFromToken =
    | { kind: "inactive" } | { kind: "own"; planId: string } | { kind: "follow"; follow: PlanFollow; created: boolean };
  /** Inserts an inactive follow (snapshot = current doc, author id/name) or returns the existing one. */
  export function followFromToken(followerId: string, token: string): Promise<FollowFromToken>;
  /** Active follows of `planId` by users other than its author. */
  export function listActiveFollowers(planId: string, authorId: string): Promise<{ userId: string; followId: string }[]>;
  ```

- [ ] **Step 1: Write failing tests** in `tenancy.test.ts`, new `describe("shared plans")` with Alice (author, plan with one workout, share enabled via direct `db().update`) and Bob:
  - `findSharedPlan(token)` returns exactly the keys `planId, authorId, authorName, name, description, doc, version` (`Object.keys(...).sort()`), with `authorName === "alice"`. Nothing in it equals Alice's email.
  - disabled link → `findSharedPlan` null; `followFromToken(bob, token)` → `{ kind: "inactive" }`.
  - `readFollowedPlan(bob, plan.id)` is null before following; after `followFromToken` it returns the doc. After Alice disables the link it **still** returns it.
  - regenerating the token (new value) → old token `findSharedPlan` null.
  - `followFromToken(alice, token)` → `{ kind: "own", planId }`; calling it twice for Bob returns the same follow id with `created: false` the second time.
  - `listActiveFollowers(plan.id, alice)` excludes Alice's own follow and inactive follows.
  - account deletion of Alice: Bob's follow survives with `customPlanId === null`, `authorId === null`, `authorName === "alice"`.
  - schema test: bump the `toBeGreaterThanOrEqual` count by one (new table).
- [ ] **Step 2: Run** `pnpm test:db src/test/tenancy.test.ts` → FAIL.
- [ ] **Step 3: Implement** schema, `pnpm db:generate` (rename to `0003_plan_sharing.sql`, append backfill), `pnpm db:migrate` on the local test DB, then the module. **Do not run migrations against `.env`'s DB (it is prod).** Use `TEST_DATABASE_URL`/docker only.
- [ ] **Step 4: Run** `pnpm test:db && pnpm typecheck && pnpm lint` → PASS (Phase 1 tests included).
- [ ] **Step 5: Commit** `feat(plans): share tokens, follow authorship and shared-plan reads`

---

### Task 3: DAL: share state, shared follows, versioned sync, notices

**Files:**
- Modify: `src/server/dal/custom-plans.ts`, `src/server/dal/plan-follows.ts`, `src/server/dal/index.ts`
- Create: `src/server/dal/plan-notices.ts`
- Test: `src/server/dal/custom-plans.test.ts`, `src/test/tenancy.test.ts` (reads/no-op updates for the new methods)

**Interfaces:**
- Consumes: `PlanChange`, `mergeChanges` (Task 1); schema (Task 2).
- Produces:
  ```ts
  // customPlans
  setShare(id: string, patch: { shareToken?: string; shareEnabled: boolean }): Promise<{ shareToken: string | null; shareEnabled: boolean } | null>;
  // planFollows
  upsertForPlan(plan: CustomPlan): Promise<PlanFollow>;   // unchanged signature; now also sets authorId = userId
  /** Follows whose author is not this user (incl. detached ones), newest first. */
  listShared(): Promise<PlanFollow[]>;
  applySync(followId: string, input: {
    expectedSeq: number; snapshotVersion: number; planName: string; authorName: string | null;
    snapshot: CustomPlanDoc; deleteIds: readonly string[]; inserts: PlannedSessionInput[];
    notice: { authorName: string; changes: PlanChange[] } | null;
  }): Promise<"applied" | "stale">;
  // planNotices (new repo, exposed as scope.planNotices)
  listOpen(): Promise<PlanNotice[]>;     // dismissedAt null, newest first
  dismiss(id: string): Promise<boolean>;
  ```
  `applySync` is one transaction: `update plan_follow set sync_seq = sync_seq + 1, snapshot_version, plan_name, snapshot, author_name where owned and sync_seq = expectedSeq returning`. No row → `"stale"` and nothing else happens. Then delete `deleteIds` / insert `inserts` for owner `{ followId }`, then merge the notice into the open one (`select … for update`, `mergeChanges`, update, or insert when none; delete the open notice when the merge is empty). Phase 1's `updateSnapshot` is removed (replaced by this).

- [ ] **Step 1: Write failing tests** (`custom-plans.test.ts`):
  - `applySync rejects a stale sequence`: two calls with the same `expectedSeq` → `"applied"` then `"stale"`, and the second call's inserts are not in `sessions.listFor`.
  - `applySync merges notices`: two applied syncs with notices on the same date (tempo→easy, then easy→intervals) → one open notice with `before.type === "tempo"`, `after.type === "intervals"`. After `dismiss`, a third sync creates a new open notice.
  - `setShare` on another user's plan → null (tenancy file). `listShared` for the author is empty; for a follower it holds the follow.
- [ ] **Step 2: Run** `pnpm test:db src/server/dal src/test/tenancy.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Use `assertOwnsFollow` before the transaction.
- [ ] **Step 4: Run** `pnpm test:db && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(plans): versioned follow sync with merged update notices`

---

### Task 4: Services: follow source, activation, propagation, catch-up, duplicate

**Files:**
- Modify: `src/services/training.ts`, `src/server/actions/custom-plans.ts` (callers of the changed `syncFollowSessions`)
- Create: `src/services/sharing.ts`
- Test: `src/services/training.test.ts`, `src/services/sharing.test.ts` (create)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (`training.ts`):
  ```ts
  export type FollowSource = { doc: CustomPlanDoc; version: number; planName: string; description: string | null; authorName: string | null; live: boolean };
  /** Own plan → scope.customPlans; someone else's → readFollowedPlan; detached/unreadable → snapshot (live: false). */
  export function resolveFollowSource(scope: UserScope, follow: PlanFollow): Promise<FollowSource>;
  export function activateFollow(scope: UserScope, followId: string, startDate: LocalDate, today: LocalDate): Promise<TrainingResult<PlanFollow>>;
  // activateCustomPlan(scope, planId, startDate, today) keeps its signature: upsertForPlan + activateFollow.
  export function syncFollowSessions(scope: UserScope, follow: PlanFollow, source: FollowSource, today: LocalDate,
    opts?: { notify?: boolean }): Promise<"applied" | "inactive">;
  /** If the active follow is someone else's plan and its version moved on, sync with notify. */
  export function catchUpActiveFollow(scope: UserScope, today: LocalDate): Promise<void>;
  ```
  `syncFollowSessions` reads the follow (its `syncSeq`), computes the Phase 1 diff, builds `notice` only when `opts.notify && follow.authorId !== scope.userId` from `sessionChanges(removedSessions, keptInserts)` (null when empty), and calls `applySync`. On `"stale"` it re-reads and retries **once more**, then throws. Activation never notifies.
- Produces (`sharing.ts`):
  ```ts
  export function updatePlanShare(scope: UserScope, planId: string, op: "enable" | "disable" | "regenerate"): Promise<{ shareToken: string | null; shareEnabled: boolean } | null>;
  export function followSharedPlan(scope: UserScope, token: string, opts: { activate: boolean; startDate: LocalDate }, today: LocalDate):
    Promise<{ ok: true; kind: "own"; planId: string } | { ok: true; kind: "follow"; followId: string; activated: boolean } | { ok: false; code: "inactive" | "invalid"; message: string }>;
  export function duplicateFollowedPlan(scope: UserScope, followId: string): Promise<CustomPlan | null>;  // name "<name> (copy)" cut to WORKOUT_LIMITS.nameMax
  /** Best effort, for `after()`: each active follower (in their own time zone) is synced with notify; failures are logged per follower. */
  export function propagatePlanUpdate(planId: string, authorId: string): Promise<void>;
  ```
  `enable` generates a token only when none exists. `regenerate` always sets a new one and enables. `propagatePlanUpdate` uses `listActiveFollowers`, `p-limit(SHARING.propagateConcurrency)`, `forUser(followerId)`, and `todayInTz(settings.timezone)`, then calls `catchUpActiveFollow`.

- [ ] **Step 1: Write failing tests** (`sharing.test.ts`, Alice author, Bob follower, plan of 2 weeks with workouts on Tue/Thu/Sun; `today` fixed):
  - `followSharedPlan(bob, token, { activate: true, startDate: today })` → Bob has dated sessions equal to `toSessionDrafts(doc, today)` and no notice.
  - `author update keeps frozen sessions and omits them from the notice`: Bob edits Tuesday's session (`isUserEdited`) and links an activity to Thursday's. Alice changes Tue, Thu and Sun of week 1 and saves (`customPlans.save`), then `propagatePlanUpdate`. Bob's Tue/Thu are unchanged, Sun matches the new doc, and the open notice's changes contain only Sun's date.
  - `concurrent syncs leave one session per day`: `Promise.all([propagatePlanUpdate(...), catchUpActiveFollow(bob, today)])` → no date appears twice in `sessions.listFor`.
  - inactive follower: not synced by propagation; on `activateFollow` gets the latest doc.
  - `detached follow activates from snapshot`: Alice deletes the plan. `resolveFollowSource` returns `live: false`, `activateFollow` succeeds from the snapshot, and `duplicateFollowedPlan` creates Bob's own plan with the same weeks.
  - author's own follow: `propagatePlanUpdate` doesn't create a notice for Alice.
  - `updatePlanShare` on Bob's scope for Alice's plan → null; `regenerate` changes the token.
- [ ] **Step 2: Run** `pnpm test:db src/services` → FAIL.
- [ ] **Step 3: Implement**, and update `saveCustomPlanAction`/`retryPlanSyncAction`'s `syncIfFollowed` to pass a `FollowSource` built from the saved plan (`version: saved.version`).
- [ ] **Step 4: Run** `pnpm test:db && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 5: Commit** `feat(plans): follow shared plans and propagate author updates`

---

### Task 5: Share dialog, preview and the read-only plan view

**Files:**
- Create: `src/components/custom-plans/share-dialog.tsx`, `src/components/custom-plans/plan-read-only.tsx`, `src/app/(app)/plans/[id]/preview/page.tsx`
- Modify: `src/components/custom-plans/plan-builder.tsx` (header actions **Preview · Share · Activate**), `src/app/(app)/plans/[id]/page.tsx` (pass share state + `shareUrl`), `src/server/actions/custom-plans.ts`

**Interfaces:**
- Actions: `updatePlanShareAction(id: string, op: "enable" | "disable" | "regenerate"): Promise<{ status: "ok"; shareUrl: string | null; enabled: boolean } | { status: "error"; message: string }>`. The URL is `${env().BETTER_AUTH_URL}${sharePath(token)}`.
- `PlanReadOnly({ name, authorName?, description, doc, units }: …)`: the header (name, "by {authorName}" when given, description, "{n} weeks"), then `PlanProfile` from `components/dashboard/volume-profile.tsx`, with weeks mapped to `{ plannedKm: weekTotals(w).km, phase: null, isCurrent: false, isFuture: true }`. Then one section per week ("Week n · x km"): day rows Mon…Sun with rest days muted, and each workout as a `<details>` (summary: name + `workoutSummary`; body: `describeStep` per step and `StructureBar size="sm"`). It is a server component, with no client state.
- `ShareDialog({ planId, initial: { shareUrl: string | null; enabled: boolean } })`, copy:
  - never shared / disabled: "Anyone with the link can view this plan and follow it." with button **Create link** / **Enable link**;
  - enabled: `CopyField label="Share link"`, then **Disable link** and **New link** (`confirm("The current link will stop working. Continue?")`), plus the line "Followers get your saved changes to their upcoming sessions."
- Preview page: owner-only (`scope.customPlans.get`, else `notFound()`), renders `PlanReadOnly` with a "← Back to builder" link and a note "This is what people with the link see."

- [ ] **Step 1: Write a failing test**: `src/services/sharing.test.ts` → `updatePlanShareAction`-level behaviour is covered by Task 4. Here, add a unit test `src/lib/custom-plans/share.test.ts` → `sharePath("abcdefghijklmnopqrstuv") === "/p/abcdefghijklmnopqrstuv"`. The UI is verified in Task 9's e2e.
- [ ] **Step 2: Implement** components, action and page. The Share button is disabled with title "Save your changes before sharing" while `state.dirty` (Share reads the saved plan).
- [ ] **Step 3: Run** `pnpm typecheck && pnpm lint && pnpm test:unit` → PASS. Check the builder header at 1280px and 390px in the browser (header wraps, no horizontal scroll).
- [ ] **Step 4: Commit** `feat(plans): share dialog and read-only plan preview`

---

### Task 6: Public page and logged-in follow

**Files:**
- Create: `src/app/p/[token]/page.tsx`, `src/app/p/[token]/follow/page.tsx`, `src/components/custom-plans/follow-form.tsx`
- Modify: `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-up/page.tsx`, `src/server/actions/custom-plans.ts`

**Interfaces:**
- Consumes: `findSharedPlan` (Task 2), `followSharedPlan` (Task 4), `PlanReadOnly` (Task 5), `isShareToken`/`followPath`/`safeNextPath` (Task 1).
- Public page (outside `(app)`, no login): malformed or unknown/disabled token → heading **"Link no longer active"**, text "Ask whoever shared it for a new link." (same response for both, HTTP 200, `robots: noindex` metadata on every `/p` page). Otherwise `PlanReadOnly` in a `NarrowPage` with the Wordmark header. Units: viewer's `settings.units` when `getCurrentUser()` is set, else `"km"`. CTA **Follow this plan**: logged in → `followPath(token)`; logged out → `/sign-up?plan=<token>`, with a secondary line "Already have an account? Sign in" → `/sign-in?next=<followPath>`. `generateMetadata` title: `${name} · Race Training`.
- Follow page: no user → `redirect('/sign-in?next=' + followPath(token))`. Onboarding incomplete → `redirect('/onboarding?plan=' + token)`. Own plan → redirect `/plans/{planId}`. Already following → "You already follow this plan." + "Open it →" `/plans/shared/{followId}`. Otherwise heading "Follow {name}", "by {author}", `FollowForm`.
- `FollowForm({ token, today })`: `Field "Start date"` (type date, min today, default next Monday; reuse `nextMonday` exported from `activate-dialog.tsx`; same hint as activation), checkbox **Activate now** (checked; hint "Unticked, the plan is just added to My plans."; when the user has an active goal/plan, add "This replaces your active goal/plan."), submit **Follow plan**.
- `followSharedPlanAction(token: string, _prev: FormState, formData: FormData): Promise<FormState>` → redirect `/plan` when activated, `/plans/shared/{followId}` otherwise; `inactive` → failure "This link is no longer active."
- Auth pages: sign-up reads `plan` and, if `isShareToken`, routes to `/onboarding?plan=<token>` after success. Sign-in reads `next` and routes to `safeNextPath(next) ?? "/dashboard"`. The "Sign in"/"Create account" cross-links keep the param.

- [ ] **Step 1: Write failing test** (`sharing.test.ts`): `followSharedPlan` with `activate: false` → follow inactive, no sessions, `planFollows.getActive()` unchanged (the existing goal stays active).
- [ ] **Step 2: Run** → FAIL if Task 4 didn't cover it; then **implement** pages, form, action, auth changes.
- [ ] **Step 3: Run** `pnpm test:db src/services/sharing.test.ts && pnpm typecheck && pnpm lint && pnpm build` → PASS (the build catches Suspense/`useSearchParams` misuse).
- [ ] **Step 4: Commit** `feat(plans): public plan page and follow flow`

---

### Task 7: Onboarding that starts on a shared plan

**Files:**
- Modify: `src/app/(app)/onboarding/page.tsx`, `src/server/actions/onboarding.ts`, `src/components/onboarding/settings-step.tsx`
- Test: `src/services/sharing.test.ts` (service path) + e2e (Task 9)

**Interfaces:**
- With a valid `?plan=<token>` the steps are `settings "Your week"` → `start "Start this plan"` → `plan "Plan preview"` → `import "Apple Watch sync"`. Without it, the steps are exactly as today. Every internal link/redirect keeps `&plan=<token>`.
- `SettingsStep` gets an optional `plan` prop rendered as `<input type="hidden" name="plan">`. `saveOnboardingSettingsAction` redirects to `?step=start&plan=<token>` when `isShareToken(plan)`, else `?step=goal`.
- Start step: `findSharedPlan(token)` null → message "This plan's link is no longer active." + link "Set a goal instead →" (`/onboarding?step=goal`). If the user already actively follows it → "You're all set." + Continue. Otherwise plan name + "by {author}" + `FollowForm` without the Activate checkbox (always activates), submitting `startSharedPlanAction(token, _prev, formData)` → `followSharedPlan(..., { activate: true })` → redirect `/onboarding?step=plan&plan=<token>`.
- Plan preview step (plan mode): `PlanReadOnly` of the active follow's source + "{n} weeks · first session {date}".

- [ ] **Step 1: Write failing test**: `followSharedPlan` on a disabled link returns `{ ok: false, code: "inactive" }` and creates no follow.
- [ ] **Step 2: Run** → FAIL; **implement**.
- [ ] **Step 3: Run** `pnpm test && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 4: Commit** `feat(onboarding): start new users on a shared plan`

---

### Task 8: Shared with me, shared plan page, notices, propagation wiring

**Files:**
- Create: `src/app/(app)/plans/shared/[followId]/page.tsx`, `src/components/custom-plans/plan-update-card.tsx`
- Modify: `src/app/(app)/plans/page.tsx`, `src/components/custom-plans/activate-dialog.tsx`, `src/services/dashboard.ts`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/plan/page.tsx`, `src/server/actions/custom-plans.ts`
- Test: `src/services/dashboard.test.ts`

**Interfaces:**
- `ActivateDialog` takes `action: (prev: FormState, fd: FormData) => Promise<FormState>` instead of `planId` (the builder passes `activateCustomPlanAction.bind(null, id)`) and exports `nextMonday`.
- Actions: `activateFollowAction(followId, _prev, fd)`, `duplicateFollowAction(followId): Promise<void>` (redirect `/plans/{newId}`), `dismissPlanNoticeAction(id): Promise<void>`.
- `saveCustomPlanAction`: after a successful save, `after(() => propagatePlanUpdate(saved.id, scope.userId))`.
- `/plans`: existing list becomes section "My plans". New section **"Shared with me"** (only when `listShared()` is non-empty): name, "by {authorName ?? "a former user"}", badges **Active** / **No longer updated**, linking to `/plans/shared/{followId}`.
- Shared plan page: owned follow only (`scope.planFollows.get`, else `notFound()`). `PlanReadOnly` from `resolveFollowSource`; when `!live` a banner: "No longer updated: the author removed this plan. Your copy and your sessions stay, and you can still activate it." Actions: **Activate** (`ActivateDialog` with `activateFollowAction`) or **Stop plan** when active, and **Duplicate** ("Make an editable copy; it won't receive updates").
- `Dashboard` gains `planNotices: { id: string; headline: string; changes: PlanChange[] }[]` from `scope.planNotices.listOpen()`, with headline from `noticeHeadline`. Dashboard and plan pages call `catchUpActiveFollow(scope, today)` before loading (same place the weekly-adaptation fallback runs on the dashboard).
- `PlanUpdateCard({ notice, units })` follows the `AdjustmentCard` look: headline, `<details>` "n sessions affected" with rows `dayLabel(date)` · `SESSION_LABELS[before.type] km → SESSION_LABELS[after.type] km` ("Added" / "Removed" when a side is null), and a **Dismiss** button. It is shown above pending adjustments on the dashboard and at the top of `/plan`.

- [ ] **Step 1: Write failing tests** (`dashboard.test.ts`): Bob follows Alice's plan (active); Alice saves a change and `propagatePlanUpdate` runs. `getDashboard(bob)` returns one notice whose headline starts with `"alice updated your plan:"`, and after `planNotices.dismiss` it returns none. Without propagation (Alice saved, propagation never ran), `catchUpActiveFollow(bob)` followed by `getDashboard` also yields the notice.
- [ ] **Step 2: Run** `pnpm test:db src/services/dashboard.test.ts` → FAIL; **implement**.
- [ ] **Step 3: Run** `pnpm test && pnpm typecheck && pnpm lint` → PASS. Check `/plans`, the shared page and the notice card at 1280px and 390px.
- [ ] **Step 4: Commit** `feat(plans): shared with me, duplicate and update notices`

---

### Task 9: End-to-end and decisions

**Files:**
- Create: `e2e/share-plan.spec.ts`
- Modify: `docs/decisions.md` (new section "Plan sharing (custom plans phase 2)")

- [ ] **Step 1: Write the e2e** (desktop 1280×800, two browser contexts):
  1. Author signs up and completes onboarding the normal way, then builds plan "Shared 10K" (1 week, easy run Tue + Thu), saves, **Share** → **Create link**, and reads the URL from the Share link field.
  2. Logged-out context opens the URL: sees "Shared 10K", "by <author name>", and no email anywhere in `page.content()`. **Follow this plan** → sign-up → onboarding shows "Your week" → Continue → "Start this plan" → start date = today → "Plan preview" → Continue → finish → dashboard shows "Shared 10K".
  3. Author changes Thursday to 10 km and saves. Follower reloads `/dashboard` and sees "updated your plan", then dismisses it.
  4. Author **Disable link**. Logged-out third context opens the URL → "Link no longer active". Follower's `/plans` still lists "Shared 10K" under "Shared with me".
  5. Follower opens it → **Duplicate** → lands in the builder of "Shared 10K (copy)".
- [ ] **Step 2: Run** `pnpm test:e2e e2e/share-plan.spec.ts` → PASS (fix and re-run until it does).
- [ ] **Step 3: Write decisions**: token on `custom_plan` (plaintext, since the author must see it again; 16 bytes); disabled/unknown tokens render the same page; follow = grant for live reads; eager `after()` propagation + lazy catch-up, guarded by `sync_seq`; one open notice per follow merged until dismissed; detached copies via `on delete set null` + `author_name`; no unfollow in v2 (removing a follow would cascade its past sessions).
- [ ] **Step 4: Run the full suite** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` → all PASS.
- [ ] **Step 5: Commit** `test(e2e): share, follow via sign-up, update and duplicate a plan`
