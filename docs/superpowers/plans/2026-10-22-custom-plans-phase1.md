# Custom Plans — Phase 1 (build & follow your own plans) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user build structured workouts and multi-week custom plans, and activate a custom plan instead of a goal so it drives the dashboard, plan calendar and activity matching.

**Architecture:** Workouts are an extension of the existing `StructureStep` model; a custom plan is one JSON document (`weeks × 7 day slots`) edited client-side and saved with optimistic versioning. Activating a plan creates a `plan_follow` row (follower + start date + snapshot) and materialises dated `planned_session` rows owned by that follow instead of a goal, so every existing session consumer keeps working through a small "session owner" generalisation. Pure logic (ops, scheduling, sync diff, estimates) lives in `src/lib/custom-plans/` and is unit-tested; DB/services follow the existing `forUser` DAL + `services/` pattern.

**Tech Stack:** Next.js 16 App Router (server actions), React 19, TypeScript strict, Drizzle + Postgres, Zod 4, Tailwind 4, Vitest (+ fast-check), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-custom-plans-sharing-design.md` (this plan covers **Phase 1** only; phases 2 and 3 get their own plans).

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (AGENTS.md: "This is NOT the Next.js you know").
- All user data access goes through `forUser(userId)` (`src/server/dal`). Not-owned rows read as `null` → pages `notFound()`. Writes referencing another user-owned row check ownership (`NotOwnedError`). Raw `db` imports only where ESLint already allows them.
- Every new app table has a `user_id` column cascading on user delete (the tenancy schema test enforces this).
- Tunable numbers go in `src/config/training.ts` ("no magic numbers in `lib/`").
- UI copy is **English**. Visual language is the "Pista" look already in the app (cream ground, ink, track red accent, Barlow Condensed headings, rounded cards).
- Desktop breakpoint is `lg` (1024px). No new navigation pattern (no sidebar).
- Weekdays are ISO (1 = Mon … 7 = Sun); local dates are `YYYY-MM-DD` strings (`LocalDate`).
- Plan weeks are **Mon–Sun regardless of `settings.weekStart`**; day slot index 0 = Monday.
- A session is **frozen** (never touched by plan sync) if `date < today` (user local), it has a linked activity, or `isUserEdited`.
- No volume rules are enforced on custom plans; weekly adaptation never runs on them.
- Users who never use custom plans must see no behaviour change.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `feat/custom-plans`.

## Review Focus

1. **Mid-week start date** — activating with a Thursday start: week-1 Mon–Wed workouts are skipped, Thu–Sun land on the right dates, week 2 starts the following Monday. (Task 2 test `skips week-one days before the start date`.)
2. **Saving an active plan with today's run already logged or a session hand-edited** — those sessions stay untouched and no second session appears on that day. (Task 2 `diffFollowSessions` tests + Task 5 service test `sync keeps frozen sessions`.)
3. **Goal → plan → goal switching** — the goal's future sessions are removed while the plan is active and rebuilt on reactivation; activity matching only ever looks at the active owner's sessions; never two sessions on one day. (Task 5 tests.)
4. **Miles users** — distances and paces typed in the editor in mi and min/mi are stored as km and sec/km and round-trip without drift. (Task 6 test `round-trips miles`.)
5. **Degenerate plans** — activating a plan with no weeks or only rest days is refused with a message; a plan whose last workout is in the past shows "Plan finished" on dashboard and plan page. (Task 5 `refuses empty plan`, Task 9 dashboard service test.)

---

## File Structure

```
src/lib/planning/types.ts            MODIFY  StructureStep gains time-based blocks + StepTarget
src/lib/planning/segments.ts         MODIFY  handle seconds/recoveryKm
src/lib/planning/describe.ts         MODIFY  describe new fields
src/lib/planning/adapt.ts            MODIFY  expectedSessionPace tolerates km-less steps
src/config/training.ts               MODIFY  WORKOUT_ESTIMATE, WORKOUT_LIMITS, EDITOR_STEPS
src/lib/custom-plans/types.ts        CREATE  PlanWorkout, CustomPlanWeek, CustomPlanDoc, SessionDraft
src/lib/custom-plans/estimate.ts     CREATE  estimateWorkout
src/lib/custom-plans/ops.ts          CREATE  pure doc operations (duplicate week, move workout…)
src/lib/custom-plans/schedule.ts     CREATE  scheduleWorkouts, toSessionDrafts, diffFollowSessions
src/lib/validation/custom-plan.ts    CREATE  zod schemas (workout, doc)
src/lib/custom-plans/*.test.ts       CREATE  unit tests
src/server/db/schema/app.ts          MODIFY  workout, custom_plan, plan_follow; planned_session changes
drizzle/0002_custom_plans.sql        CREATE  generated migration
src/server/dal/workouts.ts           CREATE
src/server/dal/custom-plans.ts       CREATE
src/server/dal/plan-follows.ts       CREATE
src/server/dal/sessions.ts           MODIFY  SessionOwner generalisation
src/server/dal/goals.ts              MODIFY  activate() also deactivates follows
src/server/dal/activities.ts         MODIFY  sinceOrGoalStart → sinceOrPlanStart(owner)
src/server/dal/{index,types,ownership}.ts MODIFY
src/services/training.ts             CREATE  getActiveTraining, activate/stop plan, syncFollow
src/services/goals.ts                MODIFY  activation clears active follow; rebuild cleared goal
src/services/{activity-linking,plan-calendar,dashboard,plans}.ts MODIFY  owner-aware
src/server/actions/{workouts,custom-plans}.ts CREATE
src/components/workouts/workout-editor.tsx  CREATE  block editor (option B)
src/components/workouts/*.tsx        CREATE  steppers, target picker, block cards
src/components/custom-plans/*.tsx    CREATE  builder (week list, week grid, editor panel), activate dialog
src/components/dashboard/plan-hero.tsx CREATE
src/app/(app)/workouts/{page,new/page,[id]/page}.tsx CREATE
src/app/(app)/plans/{page,[id]/page}.tsx            CREATE
src/app/(app)/plan/page.tsx, dashboard/page.tsx, plan/sessions/[id]/page.tsx MODIFY
e2e/custom-plan.spec.ts              CREATE
```

---

### Task 1: Extend the workout step model

**Files:**
- Modify: `src/lib/planning/types.ts:87-107`, `src/lib/planning/segments.ts`, `src/lib/planning/describe.ts:31-45`, `src/lib/planning/adapt.ts:234-260`
- Test: `src/lib/planning/segments.test.ts`, `src/lib/planning/describe.test.ts` (create)

**Interfaces:**
- Produces (in `src/lib/planning/types.ts`):
  ```ts
  export type HrZone = 1 | 2 | 3 | 4 | 5;
  export type StepTarget =
    | { kind: "pace"; secPerKm: number }
    | { kind: "hr_zone"; zone: HrZone }
    | { kind: "rpe"; rpe: number };            // integer 1–10
  export type RecoveryKind = "jog" | "walk" | "stand";
  export type StructureStep =
    | { kind: "warmup"; km?: number; seconds?: number; target?: StepTarget }
    | { kind: "cooldown"; km?: number; seconds?: number; target?: StepTarget }
    | { kind: "reps"; reps: number; repKm?: number; repSeconds?: number;
        zone?: PaceZone; paceSecPerKm?: number; effort?: string; target?: StepTarget;
        recoverySeconds?: number; recoveryKm?: number; recoveryKind?: RecoveryKind }
    | { kind: "steady"; km?: number; seconds?: number; zone?: PaceZone;
        paceSecPerKm?: number; effort?: string; target?: StepTarget };
  ```
  Exactly one of `km`/`seconds` (and of `recoverySeconds`/`recoveryKm`) is set — enforced by the zod schema in Task 3, not the type. Generated plans keep writing `km` + `zone/paceSecPerKm/effort` and stay valid unchanged.

- [ ] **Step 1: Write failing tests**

`segments.test.ts` — add:
```ts
it("weights time-based blocks and distance recoveries", () => {
  const segs = structureSegments([
    { kind: "warmup", seconds: 600 },
    { kind: "reps", reps: 2, repSeconds: 240, recoveryKm: 0.2, recoveryKind: "jog" },
  ]);
  expect(segs.map((s) => s.work)).toEqual([false, true, false, true]);
  expect(segs[0]!.weight).toBeCloseTo(600 / 360); // easy blocks use RECOVERY_SEC_PER_KM
  expect(segs[2]!.weight).toBeCloseTo(0.2);
});
it("treats a steady block with an RPE ≥ 6 or zone ≥ 3 target as work", () => {
  expect(structureSegments([{ kind: "steady", km: 3, target: { kind: "rpe", rpe: 7 } }])[0]!.work).toBe(true);
  expect(structureSegments([{ kind: "steady", km: 3, target: { kind: "hr_zone", zone: 2 } }])[0]!.work).toBe(false);
});
```
`describe.test.ts`:
```ts
expect(describeStep({ kind: "warmup", seconds: 600 }, "km")).toBe("10 min warm-up, easy");
expect(describeStep({ kind: "reps", reps: 6, repKm: 1, target: { kind: "pace", secPerKm: 240 }, recoverySeconds: 120, recoveryKind: "jog" }, "km"))
  .toBe("6 × 1.0 km @ 4:00/km, 2:00 jog between");
expect(describeStep({ kind: "steady", seconds: 1200, target: { kind: "hr_zone", zone: 3 } }, "km")).toBe("20 min @ Z3");
expect(describeStep({ kind: "reps", reps: 8, repSeconds: 60, target: { kind: "rpe", rpe: 8 }, recoveryKm: 0.2, recoveryKind: "walk" }, "km"))
  .toBe("8 × 1:00 @ RPE 8, 0.2 km walk between");
// existing generated-plan strings stay byte-identical:
expect(describeStep({ kind: "reps", reps: 6, repKm: 0.8, paceSecPerKm: 250, recoverySeconds: 90 }, "km"))
  .toBe("6 × 0.80 km @ 4:10/km, 90 s easy between");
```
(Use the exact output of the current `formatDistance`/`formatPace` for the last line — run the existing function once to confirm before asserting.)

- [ ] **Step 2: Run** `pnpm test:unit src/lib/planning` — Expected: new tests FAIL, typecheck errors where `step.km` is now optional.

- [ ] **Step 3: Implement**
  - Types as above.
  - `segments.ts`: block weight = `km ?? seconds / RECOVERY_SEC_PER_KM`; recovery weight = `recoveryKm ?? (recoverySeconds ?? 0) / RECOVERY_SEC_PER_KM`; recovery `stand` with seconds still gets a width. Steady `work` = old rule OR `target` pace present OR `hr_zone ≥ 3` OR `rpe ≥ 6`.
  - `describe.ts`: durations `< 1 h` as `"10 min"` when whole minutes, else `m:ss` for reps (`"1:00"`); targets render `@ 4:00/km` / `@ Z3` / `@ RPE 8`; recovery renders `"2:00 jog"`, `"0.2 km walk"`, legacy (no kind, seconds) stays `"90 s easy"`.
  - `adapt.ts expectedSessionPace`: skip steps without `km` (they only occur in custom plans, which adaptation never sees) — keep generated-plan behaviour identical.

- [ ] **Step 4: Run** `pnpm test:unit && pnpm typecheck` — Expected: PASS (all existing planning tests still green).

- [ ] **Step 5: Commit** `feat(planning): time-based blocks and pace/zone/RPE targets in session structure`

---

### Task 2: Custom-plan domain library (pure)

**Files:**
- Create: `src/lib/custom-plans/types.ts`, `estimate.ts`, `ops.ts`, `schedule.ts`
- Modify: `src/config/training.ts` (add `WORKOUT_ESTIMATE`, `WORKOUT_LIMITS`)
- Test: `src/lib/custom-plans/estimate.test.ts`, `ops.test.ts`, `schedule.test.ts`

**Interfaces:**
- Consumes: `StructureStep`, `SessionType`, `LocalDate`, `IsoWeekday`, `addDays`, `startOfWeek`, `isoWeekday` from `@/lib/time`.
- Produces:
  ```ts
  // types.ts
  export type WorkoutType = Exclude<SessionType, "rest">;
  export type PlanWorkout = { name: string; type: WorkoutType; notes: string | null; steps: StructureStep[] };
  export type CustomPlanWeek = { id: string; days: (PlanWorkout | null)[] }; // length 7, [0] = Monday
  export type CustomPlanDoc = { weeks: CustomPlanWeek[] };
  export type DaySlot = { week: number; day: IsoWeekday };
  export type SessionDraft = {
    sourceKey: string; date: LocalDate; weekIndex: number; type: WorkoutType;
    targetKm: number; targetPaceSecPerKm: number | null; effortDescription: string;
    structure: { steps: StructureStep[] };
  };
  // estimate.ts
  export function estimateWorkout(steps: readonly StructureStep[]): { km: number; seconds: number };
  // ops.ts  (all return a new doc; never mutate)
  export function emptyWeek(newId: () => string): CustomPlanWeek;
  export function addEmptyWeek(doc: CustomPlanDoc, newId: () => string): CustomPlanDoc;
  export function duplicateWeek(doc: CustomPlanDoc, index: number, newId: () => string): CustomPlanDoc; // copy inserted at index+1
  export function removeWeek(doc: CustomPlanDoc, index: number): CustomPlanDoc;
  export function moveWeek(doc: CustomPlanDoc, from: number, to: number): CustomPlanDoc;
  export function setDay(doc: CustomPlanDoc, slot: DaySlot, workout: PlanWorkout | null): CustomPlanDoc;
  export function moveWorkout(doc: CustomPlanDoc, from: DaySlot, to: DaySlot): CustomPlanDoc; // swaps if target occupied
  export function weekTotals(week: CustomPlanWeek): { km: number; seconds: number; runs: number; quality: number };
  // schedule.ts
  export const sourceKeyOf: (weekId: string, day: IsoWeekday) => string; // `${weekId}:${day}`
  export function scheduleWorkouts(doc: CustomPlanDoc, startDate: LocalDate): (DaySlot & { date: LocalDate; sourceKey: string; workout: PlanWorkout })[];
  export function toSessionDrafts(doc: CustomPlanDoc, startDate: LocalDate): SessionDraft[];
  export function planEndDate(doc: CustomPlanDoc, startDate: LocalDate): LocalDate | null; // date of last scheduled workout
  export type ExistingSession = { id: string; date: LocalDate; sourceKey: string | null; isUserEdited: boolean; hasActivity: boolean };
  export function diffFollowSessions(input: { desired: readonly SessionDraft[]; existing: readonly ExistingSession[]; today: LocalDate }):
    { deleteIds: string[]; inserts: SessionDraft[] };
  ```
- Config values (`src/config/training.ts`):
  ```ts
  export const WORKOUT_ESTIMATE = {
    easySecPerKm: 360,          // warm-up, cool-down, untargeted steady, Z1–2, RPE ≤ 4
    secPerKmByZone: { 1: 390, 2: 360, 3: 315, 4: 285, 5: 260 },
    secPerKmByRpe: [/*1*/390, 390, 375, 360, 330, 315, 300, 285, 270, /*10*/260],
    untargetedRepSecPerKm: 285,
    recoverySecPerKm: { jog: 420, walk: 600, stand: null }, // stand covers no distance
  } as const;
  export const WORKOUT_LIMITS = { maxWeeks: 52, maxSteps: 30, maxReps: 50, maxKm: 100, maxSeconds: 21_600,
    minPaceSecPerKm: 120, maxPaceSecPerKm: 900, nameMax: 80, notesMax: 500 } as const;
  ```

- [ ] **Step 1: Write failing tests**

`estimate.test.ts`:
```ts
it("estimates the 6×1000 example", () => {
  const e = estimateWorkout([
    { kind: "warmup", km: 2 },
    { kind: "reps", reps: 6, repKm: 1, target: { kind: "pace", secPerKm: 240 }, recoverySeconds: 120, recoveryKind: "jog" },
    { kind: "cooldown", km: 2 },
  ]);
  expect(e.km).toBeCloseTo(4 + 6 + (5 * 120) / 420, 1);   // recoveries between reps only (reps-1)
  expect(e.seconds).toBe(4 * 360 + 6 * 240 + 5 * 120);
});
it("stand recovery adds time but no distance", …);
it("time-based steady at Z3 converts with secPerKmByZone[3]", …);
```
`ops.test.ts`:
```ts
it("duplicateWeek inserts a deep copy right after the source with a new id", () => {
  let n = 0; const id = () => `w${++n}`;
  const doc = addEmptyWeek(addEmptyWeek({ weeks: [] }, id), id);            // w1, w2
  const withRun = setDay(doc, { week: 0, day: 2 }, easy8);
  const out = duplicateWeek(withRun, 0, id);
  expect(out.weeks.map((w) => w.id)).toEqual(["w1", "w3", "w2"]);
  expect(out.weeks[1]!.days[1]).toEqual(easy8);
  expect(out.weeks[1]!.days[1]).not.toBe(out.weeks[0]!.days[1]);
});
it("moveWorkout swaps when the target day is occupied", …);
it("weekTotals counts tempo/intervals/race_pace/race as quality", …);
```
`schedule.test.ts`:
```ts
it("maps week/day to dates from the Monday of the start week", () => {
  // 2026-11-02 is a Monday
  const s = scheduleWorkouts(twoWeeksTueAndSun, "2026-11-02");
  expect(s.map((x) => x.date)).toEqual(["2026-11-03", "2026-11-08", "2026-11-10", "2026-11-15"]);
});
it("skips week-one days before the start date", () => {
  const s = scheduleWorkouts(twoWeeksTueAndSun, "2026-11-05"); // Thursday
  expect(s.map((x) => x.date)).toEqual(["2026-11-08", "2026-11-10", "2026-11-15"]);
});
it("diffFollowSessions keeps frozen sessions and never doubles a day", () => {
  const out = diffFollowSessions({ today: "2026-11-10", desired, existing: [
    { id: "past", date: "2026-11-08", sourceKey: "w1:7", isUserEdited: false, hasActivity: false },
    { id: "done-today", date: "2026-11-10", sourceKey: "w2:2", isUserEdited: false, hasActivity: true },
    { id: "edited", date: "2026-11-12", sourceKey: "w2:4", isUserEdited: true, hasActivity: false },
    { id: "future", date: "2026-11-15", sourceKey: "w2:7", isUserEdited: false, hasActivity: false },
  ]});
  expect(out.deleteIds).toEqual(["future"]);
  expect(out.inserts.map((d) => d.date)).toEqual(["2026-11-15"]); // w2:2 and w2:4 held by frozen sessions; past not re-inserted
});
```
Plus a fast-check property in `schedule.test.ts`: for random docs and start dates, `scheduleWorkouts` yields strictly increasing unique dates, all `>= startDate`, each `isoWeekday(date) === day`.

- [ ] **Step 2: Run** `pnpm test:unit src/lib/custom-plans` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** the functions above. `toSessionDrafts`: `targetKm` = `estimateWorkout(...).km` rounded to 0.1; `targetPaceSecPerKm` = the first `pace` target on a `reps`/`steady` step, else `null`; `effortDescription` = `workout.notes ?? EFFORT_DESCRIPTIONS[type]`; `weekIndex` = plan week index. `diffFollowSessions`: frozen = `date < today || isUserEdited || hasActivity`; delete every non-frozen existing; insert desired drafts with `date >= today` whose `sourceKey` and `date` are not held by a frozen session.

- [ ] **Step 4: Run** `pnpm test:unit src/lib/custom-plans` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(custom-plans): pure plan document ops, scheduling, sync diff and estimates`

---

### Task 3: Validation schemas

**Files:**
- Create: `src/lib/validation/custom-plan.ts`
- Test: `src/lib/validation/custom-plan.test.ts`

**Interfaces:**
- Produces: `stepSchema`, `planWorkoutSchema` (→ `PlanWorkout`), `customPlanDocSchema` (→ `CustomPlanDoc`), `planMetaSchema` (`{ name: string(1..80), description: string(≤500) | null }`). All limits from `WORKOUT_LIMITS`.

- [ ] **Step 1: Write failing tests** — accepts the 6×1000 workout; rejects: a block with both `km` and `seconds`, with neither; `reps: 0`; `rpe: 11`; `zone: 6`; pace `100`; a week with 6 day slots; 53 weeks; a workout with 0 steps; `type: "rest"`. Accepts every structure produced by `generatePlan` (property test: run the existing `test-arbitraries` goal/settings arbitrary through `generatePlan` and parse each session's `structure.steps` with `z.array(stepSchema)`).
- [ ] **Step 2: Run** `pnpm test:unit src/lib/validation` — Expected: FAIL.
- [ ] **Step 3: Implement** with `z.discriminatedUnion("kind", …)` + `.refine` for exactly-one-of measures.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(validation): custom workout and plan schemas`

---

### Task 4: Schema, migration and DAL

**Files:**
- Modify: `src/server/db/schema/app.ts`, `src/server/dal/{index,types,ownership,sessions,goals,activities}.ts`
- Create: `drizzle/0002_custom_plans.sql` (via `pnpm db:generate`), `src/server/dal/workouts.ts`, `custom-plans.ts`, `plan-follows.ts`
- Test: `src/server/dal/custom-plans.test.ts`, extend `src/test/tenancy.test.ts`, `src/test/factories.ts`

**Interfaces:**
- Schema:
  ```ts
  planFollowStatusEnum = pgEnum("plan_follow_status", ["active", "inactive"]);
  workout:     id, userId(), name text!, type sessionTypeEnum!, notes text, steps jsonb<StructureStep[]>!, createdAt, updatedAt; index(userId)
  customPlan:  id, userId(), name text!, description text, doc jsonb<CustomPlanDoc>! default {weeks:[]}, version integer! default 1, createdAt, updatedAt; index(userId)
  planFollow:  id, userId(), customPlanId uuid → customPlan.id ON DELETE SET NULL, planName text!, snapshot jsonb<CustomPlanDoc>!,
               startDate localDate, status planFollowStatusEnum! default "inactive", createdAt, updatedAt;
               uniqueIndex one active per user (where status='active'); uniqueIndex (userId, customPlanId) where customPlanId is not null
  plannedSession: goalId → NULLABLE; + followId uuid → planFollow.id ON DELETE CASCADE; + sourceKey text; phase → NULLABLE;
               check "planned_session_one_owner_chk": (goal_id is null) <> (follow_id is null);
               index (userId, followId, date)
  ```
- DAL types (`types.ts`): `Workout`, `WorkoutInput`, `CustomPlan`, `PlanFollow`, and
  `export type SessionOwner = { goalId: string } | { followId: string };`
  `export const ownerOf = (s: Pick<PlannedSession, "goalId" | "followId">): SessionOwner`.
  `PlannedSessionInput` drops `goalId`/`followId` from caller control (owner passed separately).
- Repos (all scoped to `userId`; not-owned → `null`/`[]`/`false`):
  ```ts
  workouts:   list(): Workout[]; get(id); create(input: { name; type; notes; steps }); update(id, patch); delete(id): boolean
  customPlans: list(); get(id); create({ name, description }): CustomPlan;
               save(id, { name, description, doc }, expectedVersion: number): CustomPlan | "conflict" | null; // bumps version
               delete(id): boolean
  planFollows: getActive(): PlanFollow | null; get(id); getForPlan(customPlanId): PlanFollow | null;
               upsertForPlan(plan: CustomPlan): PlanFollow;            // creates or refreshes planName/snapshot
               activate(id, startDate: LocalDate): PlanFollow | null;   // tx: active goal → upcoming, other follow → inactive, this → active
               deactivate(id): PlanFollow | null;
               updateSnapshot(id, planName, snapshot): void
  sessions:   listFor(owner, range?); linkedSessionIds(owner); replace(owner, deleteIds, inserts); deleteFutureUnfrozen(owner, today): number
              // listForGoal(goalId, range) kept as listFor({goalId}, range) so untouched callers compile
  goals.activate(id): also sets any active plan_follow to "inactive" inside the same transaction
  activities.sinceOrPlanStart(since: Date, owner: SessionOwner)   // replaces sinceOrGoalStart; update its callers
  ownership: assertOwnsFollow(d, userId, followId); assertOwnsPlan(d, userId, planId)
  ```

- [ ] **Step 1: Write failing DB tests** (`custom-plans.test.ts`):
  - `save` with a stale version returns `"conflict"` and leaves the row unchanged; with the right version bumps `version` by 1.
  - `planFollows.activate` makes the active goal `upcoming`; `goals.activate` makes the active follow `inactive`; never two active things (query both tables).
  - deleting a `custom_plan` leaves its `plan_follow` with `customPlanId = null` and its sessions intact.
  - inserting a `planned_session` with both or neither owner fails the check constraint.
  - `deleteFutureUnfrozen` keeps past, linked and `isUserEdited` sessions.
  Tenancy (`tenancy.test.ts`): extend `createPopulatedUser` with a workout, a plan, a follow + one follow session; user B gets `null`/`[]` from every new read, no-ops from every update/delete, `NotOwnedError` from `sessions.replace({ followId: a.follow.id }, …)`; schema test's table count floor goes from 9 to 12.
- [ ] **Step 2: Run** `pnpm db:up && pnpm test:db` — Expected: FAIL.
- [ ] **Step 3: Implement** schema → `pnpm db:generate` (name the migration `0002_custom_plans`) → `pnpm db:migrate` (local DB only; `.env` points at prod — use the docker/test DB env, never run migrate against prod) → repos. Update `docs/decisions.md` "Schema" with the owner check and nullable phase.
- [ ] **Step 4: Run** `pnpm test:db && pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): workouts, custom plans, plan follows; sessions owned by goal or follow`

---

### Task 5: Training service — active thing, activation, sync

**Files:**
- Create: `src/services/training.ts`
- Modify: `src/services/goals.ts`, `src/services/activity-linking.ts`, `src/services/plan-calendar.ts`, `src/services/plans.ts` (`editSession`), `src/services/dashboard.ts` (owner plumbing only; plan-specific fields in Task 9)
- Test: `src/services/training.test.ts`

**Interfaces:**
- Consumes: Task 2 `toSessionDrafts`, `diffFollowSessions`, `planEndDate`; Task 4 repos.
- Produces:
  ```ts
  export type ActiveTraining =
    | { kind: "goal"; goal: Goal; owner: { goalId: string } }
    | { kind: "plan"; follow: PlanFollow; owner: { followId: string } }
    | null;
  export async function getActiveTraining(scope: UserScope): Promise<ActiveTraining>;
  export type TrainingResult<T> = { ok: true; value: T } | { ok: false; code: "not_found" | "invalid"; message: string };
  export async function activateCustomPlan(scope, planId: string, startDate: LocalDate, today: LocalDate): Promise<TrainingResult<PlanFollow>>;
  export async function stopCustomPlan(scope, today: LocalDate): Promise<TrainingResult<null>>;
  export async function syncFollowSessions(scope, follow: PlanFollow, doc: CustomPlanDoc, today: LocalDate): Promise<void>;
  ```
  Behaviour:
  - `activateCustomPlan`: refuse (`invalid`, "Add at least one workout before activating") when `toSessionDrafts(doc, startDate)` is empty; refuse a `startDate` before `today`. Then: `deleteFutureUnfrozen` on the previously active goal (if any) → `upsertForPlan` → `activate(followId, startDate)` → `syncFollowSessions`.
  - `syncFollowSessions`: desired = `toSessionDrafts(doc, follow.startDate)`, existing from `listFor({followId})` + `linkedSessionIds`, apply `diffFollowSessions` via `sessions.replace`, store snapshot. No-op if follow is not active.
  - `stopCustomPlan`: `deleteFutureUnfrozen` + `deactivate`.
  - `services/goals.ts activateWithPlan`: after `goals.activate`, if a follow was active, `deleteFutureUnfrozen` its sessions; then if the goal has **no sessions dated ≥ today** but has past ones → `regenerateFuture`; none at all → `createPlanIfMissing` (current behaviour); otherwise unchanged.
  - `linkToPlannedSession`: use `getActiveTraining(...)?.owner`.
  - `getPlanCalendar`: `linkedSessionIds(ownerOf(sessions[0]))`.
  - `editSession`: date upper bound = `goal.raceDate` for goal sessions; follow sessions accept any valid date; same-day conflict check uses `listFor(ownerOf(session), …)`; type change derives pace only for goal sessions (follow sessions keep their `targetPaceSecPerKm`).

- [ ] **Step 1: Write failing tests** (`training.test.ts`):
  - `activates a plan from a Thursday` → sessions only on/after that Thursday, on the plan's weekdays.
  - `goal → plan → goal`: goal's future sessions gone while plan active; after re-activating the goal it has future sessions again and no date has two sessions (`SELECT date, count(*) … HAVING count(*) > 1` is empty).
  - `sync keeps frozen sessions`: link an activity to today's session and hand-edit tomorrow's, change both in the doc, sync → both unchanged, other future sessions updated.
  - `refuses empty plan` (0 weeks, and only-null days).
  - `activity linking uses the active plan`: with a plan active, `linkToPlannedSession` links a run to the follow session of that date.
  - Existing `src/services/goals.test.ts` stays green unchanged (no-behaviour-change guarantee).
- [ ] **Step 2: Run** `pnpm test:db src/services` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:db && pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(training): activate/stop custom plans and keep their sessions in sync`

---

### Task 6: Workout editor component (option B)

**Files:**
- Create: `src/components/workouts/workout-editor.tsx` (client), `block-card.tsx`, `stepper.tsx`, `target-picker.tsx`, `src/lib/custom-plans/editor-model.ts` (pure display⇄storage conversion, in `lib/` so it runs in the unit project)
- Modify: `src/config/training.ts` (`EDITOR_STEPS`)
- Test: `src/lib/custom-plans/editor-model.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function WorkoutEditor(props: { value: PlanWorkout; onChange: (next: PlanWorkout) => void; units: Units }): JSX.Element;
  // editor-model.ts
  export function newBlock(kind: "warmup" | "steady" | "reps" | "cooldown"): StructureStep; // warmup/cooldown 2 km, steady 5 km, reps 6 × 1 km rec 120 s jog
  export function toDisplay(step: StructureStep, units: Units): BlockDisplay;   // distances/paces in user units
  export function fromDisplay(d: BlockDisplay, units: Units): StructureStep;    // back to km / sec-per-km
  export const EDITOR_STEPS = { distance: 0.5, repDistanceKm: 0.1, repDistanceMi: 0.1, blockSeconds: 30, recoverySeconds: 15, paceSeconds: 5 };
  ```
- UI (matches approved mockup `.superpowers/brainstorm/40350-1792652117/content/configurador.html`, option B): name + session type select at top; block cards (Warm-up / Run / Repeat N× / Cool-down) each with a distance⇄time toggle and −/+ steppers that also accept typed input; Repeat card has a red left border, rep measure, target picker (Pace · Zone · RPE · none), recovery (time or distance + jog/walk/stand); "+ Block" / "+ Repeat"; move up/down and delete per block; live `StructureBar` and "≈ 11.5 km · 52 min" from `estimateWorkout`. All controls keyboard-operable with labels.

- [ ] **Step 1: Write failing tests** (`editor-model.test.ts`): `round-trips miles` — a 6 × 1 mi @ 6:30/mi block → `fromDisplay(toDisplay(x,"mi"),"mi")` deep-equals x within 1e-9 km and ±0 s pace; `newBlock("reps")` matches the defaults above.
- [ ] **Step 2: Run** `pnpm test:unit` — Expected: FAIL.
- [ ] **Step 3: Implement** model, then components.
- [ ] **Step 4: Run** `pnpm test:unit && pnpm typecheck && pnpm lint` — Expected: PASS. Manually: render on `/workouts/new` (Task 7) at 390px and 1280px.
- [ ] **Step 5: Commit** `feat(workouts): block-based workout editor`

---

### Task 7: My workouts pages and actions

**Files:**
- Create: `src/server/actions/workouts.ts`, `src/app/(app)/workouts/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `src/components/workouts/workout-form.tsx` (client wrapper: editor + Save/Delete)
- Test: extend `src/server/dal/custom-plans.test.ts` (workout CRUD) and `src/test/tenancy.test.ts` (actions aren't unit-tested in this repo)

**Interfaces:**
- Produces:
  ```ts
  saveWorkoutAction(id: string | null, workout: PlanWorkout): Promise<FormState>; // validates with planWorkoutSchema; create → redirect(`/workouts/${id}`)
  deleteWorkoutAction(id: string): Promise<void>;                                  // redirect("/workouts")
  ```
- `/workouts`: list cards (name, type, ≈ distance/time, mini StructureBar) + "New workout". Empty state explains what workouts are for.

- [ ] **Step 1: Write failing test** — DAL CRUD round-trip of the 6×1000 workout; B cannot read/update/delete A's workout (add to tenancy test).
- [ ] **Step 2: Run** `pnpm test:db` — FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test:db && pnpm typecheck && pnpm lint` — PASS.
- [ ] **Step 5: Commit** `feat(workouts): My workouts library`

---

### Task 8: Plan builder (My plans + builder page)

**Files:**
- Create: `src/server/actions/custom-plans.ts`, `src/app/(app)/plans/page.tsx`, `src/app/(app)/plans/[id]/page.tsx`, `src/components/custom-plans/plan-builder.tsx` (client root), `week-list.tsx`, `week-grid.tsx`, `day-cell.tsx`, `workout-library.tsx`, `editor-panel.tsx`, `activate-dialog.tsx`, `use-plan-builder.ts` (reducer over Task 2 ops)
- Test: `src/lib/custom-plans/builder-reducer.test.ts` (put the reducer's pure part in `src/lib/custom-plans/builder-reducer.ts`)

**Interfaces:**
- Consumes: Task 2 ops, Task 6 `WorkoutEditor`, Task 5 `activateCustomPlan`/`syncFollowSessions`.
- Produces:
  ```ts
  createCustomPlanAction(_prev: FormState, formData: FormData): Promise<FormState>; // name → create with one empty week → redirect(`/plans/${id}`)
  saveCustomPlanAction(id: string, input: { name: string; description: string | null; doc: CustomPlanDoc; version: number }):
    Promise<{ status: "saved"; version: number } | { status: "conflict" } | { status: "error"; message: string }>;
    // validates; on save, if this plan's follow is active → syncFollowSessions; revalidate /plan, /dashboard
  deleteCustomPlanAction(id: string): Promise<void>;  // if its follow is active → stopCustomPlan first
  activateCustomPlanAction(id: string, _prev: FormState, formData: FormData): Promise<FormState>; // startDate; redirect("/plan")
  stopCustomPlanAction(): Promise<void>;
  // builder-reducer.ts
  type BuilderState = { doc: CustomPlanDoc; name: string; description: string | null; selected: DaySlot | null; selectedWeek: number; dirty: boolean };
  type BuilderAction = { type: "duplicateWeek"; index: number } | { type: "addWeek" } | { type: "removeWeek"; index: number }
    | { type: "moveWeek"; from: number; to: number } | { type: "selectWeek"; index: number } | { type: "select"; slot: DaySlot | null }
    | { type: "setDay"; slot: DaySlot; workout: PlanWorkout | null } | { type: "move"; from: DaySlot; to: DaySlot }
    | { type: "rename"; name: string } | { type: "saved" };
  export function builderReducer(s: BuilderState, a: BuilderAction, newId: () => string): BuilderState;
  ```
- Layout (approved mockup `.superpowers/brainstorm/40350-1792652117/content/plan-desktop.html`):
  - Header: "My plans ›" breadcrumb, editable name, optional description (collapsible textarea), "n weeks · up to r runs/week", actions **Save** (disabled when clean; "Unsaved changes" hint; `beforeunload` guard) and **Activate** (opens `activate-dialog`: start date input, default next Monday ≥ today, min today; shows "This replaces your active goal/plan" when one exists). No Share button until Phase 2.
  - `lg+`: grid `170px 1fr 330px`. Left: week rows (label, km) each with a **Duplicate** button and a menu for move up/down/delete; "+ Empty week"; mini volume profile of `weekTotals(...).km` with selected week in accent. Centre: "Week n" + totals (km · time · quality count), prev/next, 7 day columns (Mon…Sun) with workout cards (name, ≈ distance + main target, `StructureBar size="sm"`), "+ workout" on empty days (creates `newBlock`-based default "Easy run" and selects it); below, My workouts chips draggable onto a day (native HTML5 DnD) and "+ New workout". Right: `WorkoutEditor` for the selected slot, with Duplicate-to-day (`Move to…`/`Copy to…` select of weekdays), Remove, and "Save to My workouts" (calls `saveWorkoutAction(null, workout)`).
  - `< lg`: stacked — horizontal scrollable week chips with Duplicate on the selected week, then day list, tapping a workout opens the editor full-screen (a sheet with Done). DnD replaced by "Add from My workouts" picker per empty day and "Move to…" select.
  - Conflict response → banner "This plan was changed in another tab. Reload to see the latest version." (no overwrite).
- `/plans`: list of the user's plans (name, weeks, updated, "Active" badge) + "New plan" form (name only).
- Entry points: on `/plan`, a header link row "My plans · My workouts" (both kinds of active thing, and in the no-active-goal empty state: "Choose or create a goal → · or build your own plan →").

- [ ] **Step 1: Write failing tests** (`builder-reducer.test.ts`): `duplicateWeek` selects the new copy and sets `dirty`; `saved` clears `dirty`; `removeWeek` of the selected last week moves selection to the new last week; `move` onto an occupied day swaps and keeps the moved workout selected.
- [ ] **Step 2: Run** `pnpm test:unit` — FAIL. **Step 3: Implement** reducer, actions, pages, components.
- [ ] **Step 4: Run** `pnpm test:unit && pnpm test:db && pnpm typecheck && pnpm lint` — PASS. Manually build the 3-week example at 1280px and 390px.
- [ ] **Step 5: Commit** `feat(plans): custom plan builder with per-week duplicate`

---

### Task 9: Plan page, session page and dashboard with a custom plan active

**Files:**
- Modify: `src/app/(app)/plan/page.tsx`, `src/app/(app)/plan/sessions/[id]/page.tsx`, `src/services/dashboard.ts`, `src/app/(app)/dashboard/page.tsx`, `src/components/plan/plan-overview.tsx`, `src/components/plan/month-calendar.tsx`, `src/lib/plan-calendar/index.ts` (phase nullable), `src/app/(app)/goals/page.tsx`
- Create: `src/components/dashboard/plan-hero.tsx`
- Test: `src/services/dashboard.test.ts` (extend), `src/lib/plan-calendar/plan-calendar.test.ts` (null phase case)

**Interfaces:**
- `Dashboard` gains `plan: { followId: string; name: string; customPlanId: string | null; endDate: LocalDate | null; finished: boolean } | null`; `goal` stays `null` when a plan is active; `daysToRace`/`prediction` null.
- `PlanHero({ plan, weekNumber, totalWeeks, volume, units })`: red block like `RaceHero` but headline "Week n of N" (Barlow Condensed italic 800), plan name, the same elevation profile of weekly planned km (extract the profile SVG from `race-hero.tsx` into a shared `volume-profile.tsx` if it isn't already standalone) — no countdown, no prediction chip, no phase bar. When `finished`: "Plan finished" with links "My plans" and "Goals".
- Plan page with a plan active: title = plan name, subtitle "Week n of N · started <date>", links **Edit plan** (`/plans/{customPlanId}`, hidden if null) and **Stop plan** (`ConfirmButton` → `stopCustomPlanAction`); no Regenerate, no warnings, no Adjustment history; `PlanOverview` and week groups/month calendar unchanged except a null phase renders neutral (no dot, no phase label).
- Session page: works for follow sessions (no `goal` lookup when `followId`); edit form `maxDate` omitted for follow sessions.
- Goals page: when a plan is active, a notice "You're following **{plan name}**. Activating a goal will stop it."

- [ ] **Step 1: Write failing tests**: dashboard with an active follow returns `plan.name`, `weekNumber` counted from the follow's first session week, `prediction === null`; a follow whose last session is before today returns `plan.finished === true`; `buildMonthGrid` accepts `phase: null`.
- [ ] **Step 2: Run** `pnpm test` — FAIL. **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm lint` — PASS.
- [ ] **Step 5: Commit** `feat(plan): dashboard, plan and session views for custom plans`

---

### Task 10: End-to-end and finish

**Files:**
- Create: `e2e/custom-plan.spec.ts`
- Modify: `e2e/db.ts` if a helper is needed

- [ ] **Step 1: Write the e2e test** (desktop viewport 1280×800): sign up → skip/complete onboarding with a goal (existing helper path) → `/workouts/new`: build "6×1000" (warm-up 2 km, Repeat 6 × 1000 m @ 4:00/km rec 2:00 jog, cool-down 2 km), Save, expect "≈ 11.5 km" → `/plans` new plan "Base 10K" → add the workout on Tuesday of week 1 by dragging from My workouts, add an easy run Thursday → **Duplicate** week 1 → expect week list "Week 1, Week 2" with equal km → Save → Activate with start date next Monday → `/dashboard` shows "Week 1 of 2" and "Base 10K" → `/goals` shows the "You're following" notice → activate the goal again → `/dashboard` shows the race countdown.
- [ ] **Step 2: Run** `pnpm test:e2e e2e/custom-plan.spec.ts` — Expected: PASS (fix and re-run until it does).
- [ ] **Step 3: Run the full suite** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` — Expected: all PASS.
- [ ] **Step 4: Commit** `test(e2e): build, duplicate and activate a custom plan`
