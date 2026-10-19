# Desktop Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use desktop width (≥1024px) on dashboard, plan (month calendar), activities and goals, leaving mobile exactly as it is.

**Architecture:** Mostly responsive Tailwind changes on existing pages, behind `lg:`. The one new feature is the plan's month calendar. A pure month-grid builder in `src/lib/plan-calendar/` (unit tested) feeds a small service that loads the month's activities (DB tested), and a server component renders it. Month navigation is plain links with `?month=YYYY-MM`.

**Tech Stack:** Next.js (repo version — see `node_modules/next/dist/docs/`), React server components, Tailwind v4, Drizzle, Vitest (`unit` + `db` projects), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-desktop-layout-design.md`

## Global Constraints

- Desktop breakpoint is `lg` (1024px). Below `lg` every screen renders exactly as today: no class changes without an `lg:` prefix, except purely additive wrappers.
- App container: `max-w-3xl` below `lg`, `lg:max-w-7xl` (1280px) at `lg` and up, for both header and `<main>`.
- Form pages (Settings, Log, New goal, Onboarding) stay narrow and centred at `max-w-2xl` (≈640px).
- Keep the Pista visual language: tokens from `src/app/globals.css` only (`bg-surface`, `text-muted`, `bg-hero`, `border-accent`, phase colours via `PHASE_BG`…). No new colours.
- Read the relevant guide in `node_modules/next/dist/docs/` before touching page props (`searchParams`) or routing. This Next version has breaking changes (`AGENTS.md`).
- UI copy is English, like the rest of the app.
- Work on branch `feat/desktop-layout`.

## Review Focus

1. **`?month=` garbage or out of range** (`abc`, `2026-13`, a month years after the race): the page must not crash. It falls back to the default month, clamped to the plan's months. → test in Task 3.
2. **Today after race day, or before the first session:** the calendar opens on the nearest plan month, not an empty one. → test in Task 3.
3. **Runs near midnight in the user's time zone** must land on their *local* day, not the UTC day. → test in Task 4.
4. **`weekStart = 7` (Sunday):** headers, rows and week totals align to Sunday. → test in Task 3.
5. **Two sessions on one day, plus an unlinked run that day:** the cell lists all of them; its border follows the hardest session. → test in Task 3.

---

### Task 1: Wider app container + narrow form pages

**Files:**
- Modify: `src/app/(app)/layout.tsx:23,44`
- Create: `src/components/ui/narrow-page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`, `src/app/(app)/log/page.tsx`, `src/app/(app)/goals/new/page.tsx`, `src/app/(app)/onboarding/page.tsx` (already `max-w-lg`; leave it as is)
- Modify: `.gitignore` (add `.superpowers/`)

**Interfaces:**
- Produces: `NarrowPage({ children, className? }: { children: ReactNode; className?: string })`. It renders `<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 …">`. Pages replace their outer `flex flex-col gap-4` div with it.

- [ ] **Step 1: Branch.** `git switch -c feat/desktop-layout`.
- [ ] **Step 2:** In the layout, change both `max-w-3xl` to `max-w-3xl lg:max-w-7xl`. Add `NarrowPage` and apply it to Settings, Log and New goal.
- [ ] **Step 3: Verify.** `pnpm typecheck && pnpm lint`. Expected: both pass.
- [ ] **Step 4: Visual check** (skill `run`, Playwright MCP), signed in with seeded data (`pnpm seed`). At 1440×900 the header spans about 1280px and `/settings` stays about 640px and centred. At 390×844 `/dashboard` and `/settings` look identical to `main`.
- [ ] **Step 5: Commit** spec, plan, `.gitignore` and code: `feat(ui): widen app container on desktop, keep forms narrow`.

### Task 2: Dashboard two-column layout

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx` (the goal-present return only)

**Interfaces:**
- Consumes: nothing new. This is a pure JSX/class rearrangement of existing components.

- [ ] **Step 1:** Restructure the return:
  - `prompts` and the "Suggested changes" card go full width on top.
  - Then a wrapper `flex flex-col gap-3.5 lg:grid lg:grid-cols-12 lg:items-start`.
  - Left column (`lg:col-span-5`): `RaceHero`, `TodayCard`, stat row, "This week" card.
  - Right column (`lg:col-span-7`): `VolumeBars` card, then a `grid gap-3.5 xl:grid-cols-2` with the ACWR card and the long-run card. They stack below `xl`, where the 7/12 column is too narrow for two charts.
  - Mobile order must stay: prompts, hero, today, stats, suggested changes, week, volume, ACWR, long run. Suggested changes moving above the hero on mobile is **not** allowed. Render it twice instead: once in the old spot with `lg:hidden`, once in the top block with `hidden lg:flex`. Wrap it in a local `const suggestions = …` so it's written only once.
- [ ] **Step 2:** Look at the chart components (`acwr-chart.tsx`, `long-run-chart.tsx`, `volume-bars.tsx`). If any plot has a fixed pixel height that looks squashed at about 700px wide, raise it only at `lg:`.
- [ ] **Step 3: Verify.** `pnpm typecheck && pnpm lint && pnpm test:db -- dashboard`. All pass.
- [ ] **Step 4: Visual check** at 1440, 1100 and 390 widths. At 1440: two columns with the two small charts side by side. At 1100: two columns with the small charts stacked. At 390: unchanged from `main`.
- [ ] **Step 5: Commit** `feat(dashboard): two-column desktop layout`.

### Task 3: Month-grid builder (pure)

**Files:**
- Create: `src/lib/plan-calendar/index.ts`
- Test: `src/lib/plan-calendar/plan-calendar.test.ts` (picked up by the `unit` project)

**Interfaces:**
- Consumes: `startOfWeek`, `addDays`, `isoWeekday` from `@/lib/time`; `weeklyVolume`, `sessionStatus`, `SessionStatus` from `@/lib/metrics/volume`; `MetricActivity` from `@/lib/metrics/types`; `Phase` from `@/lib/planning/types`; `PlannedSession` (type only) from `@/server/dal`.
- Produces:

```ts
export type YearMonth = string; // "YYYY-MM"

export type CalendarSession = {
  id: string;
  type: PlannedSession["type"];
  targetKm: number;
  status: SessionStatus;            // "done" | "missed" | "today" | "upcoming" | "rest"
  structure: PlannedSession["structure"];
};
export type CalendarRun = { id: string; km: number };
export type CalendarDay = {
  date: LocalDate;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isRace: boolean;                  // any session of type "race"
  emphasis: "quality" | "long" | "none"; // hardest session: quality (tempo|intervals|race_pace|race) > long > none
  sessions: CalendarSession[];      // date order as given
  unlinkedRuns: CalendarRun[];      // activities that day with plannedSessionId null or pointing outside `sessions`
};
export type CalendarWeek = {
  start: LocalDate;
  days: CalendarDay[];              // always 7, in weekStart order
  plan: { number: number; phase: Phase; plannedKm: number; actualKm: number; isCurrent: boolean } | null;
};
export type MonthGrid = { month: YearMonth; weeks: CalendarWeek[]; prev: YearMonth | null; next: YearMonth | null };

/** Resolve the `?month=` param: valid and inside the plan's months → as is; otherwise today's month clamped to [first, last] plan month. */
export function resolveMonth(param: string | undefined, today: LocalDate, sessions: readonly Pick<PlannedSession, "date">[]): YearMonth;

/** Inclusive local-date range the grid covers (whole weeks around the month). */
export function gridRange(month: YearMonth, weekStart: IsoWeekday): { from: LocalDate; to: LocalDate };

export function buildMonthGrid(input: {
  month: YearMonth;
  weekStart: IsoWeekday;
  today: LocalDate;
  sessions: readonly Pick<PlannedSession, "id" | "date" | "type" | "targetKm" | "phase" | "structure">[]; // all sessions of the goal
  activities: readonly Pick<MetricActivity, "id" | "localDate" | "km" | "plannedSessionId">[];      // at least those within gridRange
}): MonthGrid;
```

Rules the builder must implement:
- **Plan week `number`:** the 1-based index of the week's start among the distinct `startOfWeek(session.date)` values of *all* sessions. This is the same numbering as the plan page's "Week {i+1}".
- **Week `phase`:** the phase of the first session that week.
- **`plannedKm`:** the sum of non-rest `targetKm`.
- **`actualKm`:** the week's `actualKm` from `weeklyVolume` (all runs that week).
- **`plan`** is `null` for weeks with no sessions.
- **`status`:** `sessionStatus(session, today, completed)`, where `completed` means some activity has `plannedSessionId === session.id`.
- **`prev` / `next`:** the adjacent month, or `null` when it is outside [first, last] plan month.

- [ ] **Step 1: Write failing tests.** One `describe("plan calendar")`, fixtures built inline with `today = "2026-10-20"`:
  - `gridRange("2026-10", 1)` → `{ from: "2026-09-28", to: "2026-11-01" }`. `gridRange("2026-10", 7)` → `{ from: "2026-09-27", to: "2026-10-31" }`.
  - `buildMonthGrid` with weekStart 1: `weeks.length === 5`, every `days.length === 7`, `weeks[0].days[0].date === "2026-09-28"` with `inMonth === false`, and the day `"2026-10-20"` has `isToday === true`.
  - **weekStart 7:** `weeks[0].start === "2026-09-27"` and `isoWeekday(weeks[0].days[0].date) === 7`.
  - **Status:** a past intervals session with a linked activity → `"done"`. A past easy session without one → `"missed"`. A past rest → `"rest"`. Today's unlinked session → `"today"`.
  - **Two sessions one day + unlinked run:** a `long` and an `intervals` on `"2026-10-14"`, plus an activity that day with `plannedSessionId: null`. The day has `sessions.length === 2`, `emphasis === "quality"`, `unlinkedRuns` `[{ id, km }]`.
  - **Unlinked run on a rest day** appears in `unlinkedRuns`. A linked run does **not**.
  - **Week totals:** `plannedKm` excludes rest. `actualKm` includes an unlinked run. `number` matches the index among session weeks. `plan === null` for a week before the first session. `isCurrent` holds only for the week containing today.
  - **Race day:** `isRace === true`.
  - **`resolveMonth`:** with sessions from `"2026-09-01"` to `"2026-12-06"`:
    - `undefined` → `"2026-10"`
    - `"2026-11"` → `"2026-11"`
    - `"abc"` → `"2026-10"`
    - `"2026-13"` → `"2026-10"`
    - `"2030-01"` → `"2026-10"`
    - with `today = "2027-02-01"` → `"2026-12"`
    - with `today = "2026-06-01"` → `"2026-09"`
    - with no sessions → today's month
  - **`prev` / `next`:** `"2026-09"` → `prev: null, next: "2026-10"`. `"2026-12"` → `next: null`.
- [ ] **Step 2: Run.** `pnpm test:unit -- plan-calendar`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** in `src/lib/plan-calendar/index.ts`. Reuse the `HARD` set: export it from `session-card.tsx`, or better, move it to `src/lib/planning/describe.ts` as `QUALITY_TYPES` and import it in both places.
- [ ] **Step 4: Run.** `pnpm test:unit -- plan-calendar`. Expected: PASS. Also run `pnpm test:unit` to check nothing else broke.
- [ ] **Step 5: Commit** `feat(plan): month calendar grid builder`.

### Task 4: Calendar data service

**Files:**
- Modify: `src/server/dal/activities.ts` (add `between`)
- Create: `src/services/plan-calendar.ts`
- Test: `src/services/plan-calendar.test.ts` (`db` project; needs `pnpm db:up`)

**Interfaces:**
- Consumes: Task 3's `gridRange`, `buildMonthGrid`, `MonthGrid`, `YearMonth`; `localDateOf`.
- Produces:
  - DAL: `between(from: Date, to: Date): Promise<Activity[]>`. Returns activities with `from <= startAt < to`, oldest first, scoped to the user. Same style as `since`.
  - Service: `getPlanCalendar(scope: UserScope, settings: Settings, sessions: readonly PlannedSession[], month: YearMonth, today: LocalDate): Promise<MonthGrid>`. It queries a UTC window padded by one day on each side of `gridRange`, maps rows to `{ id, localDate: localDateOf(startAt, settings.timezone), km, plannedSessionId }`, keeps those whose `localDate` is inside the range, and calls `buildMonthGrid`.

- [ ] **Step 1: Write failing tests**, using `userWithPlan`-style setup from `plans.test.ts` and `createTestUser` from `@/test/factories`:
  - **Linked:** an activity upserted with `plannedSessionId` of a past session → that session's `status === "done"`.
  - **Unlinked:** an activity on a date with no session, or on a rest day → in that day's `unlinkedRuns`.
  - **Time zone (Review Focus 3):** set the user's timezone to `"Europe/Madrid"` via `scope.settings.update({ timezone: "Europe/Madrid" })`. An activity at `2026-10-14T22:30:00Z` (00:30 local on the 15th) appears on `"2026-10-15"`, not `"2026-10-14"`.
  - **Tenancy:** another user's activity on the same date doesn't appear.
- [ ] **Step 2: Run.** `pnpm test:db -- plan-calendar`. Expected: FAIL.
- [ ] **Step 3: Implement** `between` and `getPlanCalendar`.
- [ ] **Step 4: Run.** `pnpm test:db -- plan-calendar`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(plan): load month calendar data`.

### Task 5: Month calendar UI on `/plan`

**Files:**
- Create: `src/components/plan/month-calendar.tsx` (server component)
- Modify: `src/app/(app)/plan/page.tsx`

**Interfaces:**
- Consumes: `MonthGrid`, `resolveMonth` (Task 3), `getPlanCalendar` (Task 4), `PHASE_BG`, `PHASE_LABELS`, `SESSION_LABELS`, `StructureBar`, `formatDistanceValue`, `WEEKDAY_LABELS`.
- Produces: `MonthCalendar({ grid, units, today }: { grid: MonthGrid; units: Units; today: LocalDate })`.

- [ ] **Step 1: Page wiring.**
  - Read `month` from `searchParams`, checking the Next docs for its shape in this version.
  - Call `resolveMonth` and then `getPlanCalendar`, in parallel with the existing loads where possible.
  - Header band: `lg:grid lg:grid-cols-[1fr_1.3fr] lg:items-end lg:gap-6`, with goal name + `GoalFacts` on the left and the `PlanOverview` card content on the right. Warnings and regenerate go below, unchanged.
  - Render `<div className="hidden lg:block"><MonthCalendar …/></div>` and wrap the existing week-groups list in `lg:hidden`. Adjustment history stays full width below both.
- [ ] **Step 2: `MonthCalendar` markup** (mockup: `.superpowers/brainstorm/*/content/plan-month.html`):
  - **Nav row:** `‹` link (`?month={prev}`, disabled span when null), month title in `font-condensed` italic uppercase (`toLocaleString("en-GB", { month: "long", year: "numeric" })`), `›` link, and a "Today" link to `/plan`.
  - **Legend** in muted text: "✓ done · ! missed".
  - **Grid:** `grid grid-cols-[repeat(7,minmax(0,1fr))_6rem] gap-1.5`. The header row has the 7 weekday short labels in `weekStart` order (taken from `grid.weeks[0].days`) plus "Week".
  - **Day cell** (`rounded-xl bg-surface border border-border p-1.5 min-h-20`):
    - `inMonth=false` → `opacity-40`. `isPast` → `opacity-75`. `isToday` → `ring-2 ring-accent` with the day number in accent plus "· Today".
    - `emphasis` "quality" → `border-l-4 border-l-accent`. "long" → `border-l-4 border-l-foreground`.
    - A rest-only day → `bg-transparent` with muted "Rest". `isRace` → `bg-hero text-hero-foreground`.
    - Each session is a `<Link href={`/plan/sessions/${id}`}>` with `SESSION_LABELS[type]` and `formatDistanceValue(targetKm)` in `font-condensed font-bold`, plus a `StructureBar size="sm"` when the structure has steps.
    - Status mark top-right: "✓" `text-status-good`, "!" `text-status-warning`, with `aria-label` "done" / "missed".
    - Each unlinked run is a muted `<Link href={`/activities/${id}`}>` reading "Run · {km} {units}".
    - Empty days are just the number.
  - **Week cell:** `plan` null → empty. Otherwise `border-l-4` in the phase colour (`PHASE_BG[phase]` gives a bg class, so use a phase-coloured inner bar if a border class isn't available), "Week {number} · {PHASE_LABELS[phase]}", and `{actualKm} / {plannedKm} {units}`. The current week gets `ring-2 ring-accent`.
- [ ] **Step 3: Verify.** `pnpm typecheck && pnpm lint && pnpm test`. All pass.
- [ ] **Step 4: Visual check** at 1440 on `/plan`, `/plan?month=<prev>`, `/plan?month=abc`, and the race month. Clicking a session opens its page, and clicking an unlinked run opens the activity. At 390, `/plan` is unchanged from `main`.
- [ ] **Step 5: Commit** `feat(plan): month calendar on desktop`.

### Task 6: Activity detail, activities list, goals

**Files:**
- Modify: `src/app/(app)/activities/[id]/page.tsx`
- Modify: `src/components/activities/activity-row.tsx`, `src/app/(app)/activities/page.tsx`
- Modify: `src/app/(app)/goals/page.tsx`, `src/app/(app)/goals/[id]/page.tsx`

**Interfaces:**
- Produces: `ActivityRow({ a, units, columns = false }: { a: ActivityRowData; units: Units; columns?: boolean })`. Only `/activities` passes `columns`; `/log` (narrow) keeps the current row.

- [ ] **Step 1: Activity detail.**
  - The stat tiles stay on top.
  - Below them goes `lg:grid lg:grid-cols-2 lg:items-start gap-4`.
  - Left column: Route (map taller at `lg:`, e.g. `lg:h-96`, if `RouteMapLazy` takes a class or height) and Splits.
  - Right column: Planned session, "How did it feel?", HR chart and zones.
  - The HR-settings note and delete stay full width at the bottom.
  - Mobile keeps the current order. If the column split would reorder it, use the same `lg:hidden` / `hidden lg:block` duplication as Task 2 only for the piece that moves.
- [ ] **Step 2: `ActivityRow` with `columns`.**
  - At `lg`, the link becomes `lg:grid lg:grid-cols-[6rem_1fr_6rem_6rem_6rem_5rem_4rem] lg:items-center`, with columns date · type · distance · time · pace · avg HR · RPE.
  - Below `lg` the markup is unchanged.
  - The `/activities` card gets a header row at `lg` (`hidden lg:grid`, same template, muted xs uppercase labels).
- [ ] **Step 3: Goals.**
  - `/goals`: wrap the Current and History cards in `lg:grid lg:grid-cols-2 lg:items-start gap-4`.
  - `/goals/[id]`: below the title, use `lg:grid lg:grid-cols-[minmax(0,40rem)_1fr] gap-4`, with "Edit goal" on the left and "Log your result" + "Status" on the right.
- [ ] **Step 4: Verify.** `pnpm typecheck && pnpm lint`. Then visually check each page at 1440 and 390: 390 is unchanged from `main`.
- [ ] **Step 5: Commit** `feat(ui): desktop layouts for activities and goals`.

### Task 7: Whole-branch verification

- [ ] **Step 1:** Run `pnpm test && pnpm test:e2e`. Expected: all pass. `e2e/journey.spec.ts` runs on a Pixel 7 viewport (`playwright.config.ts:17`), so add one test at 1440×900 that opens `/plan`, sees the month title, and clicks a session link through to `/plan/sessions/`.
- [ ] **Step 2:** Run the `react-doctor` skill on the changed files and fix what it flags.
- [ ] **Step 3:** Commit any fixes: `test(e2e): desktop plan calendar`.
