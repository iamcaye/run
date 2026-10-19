# Desktop layout — design

Date: 2026-10-19 · Status: approved in brainstorming, pending plan

## Intent

The "Pista" redesign (PR #11) works well on phones, but on a PC every
screen is a single narrow column: `src/app/(app)/layout.tsx` caps header and
`<main>` at `max-w-3xl` (768px), and every page is a vertical stack of `Card`s.
On a 1440px monitor more than half the screen is empty.

On the PC the user mostly **looks at the plan and the charts**; logging runs is a
phone thing. So the desktop work spends the extra width on the plan and the
charts first, and leaves forms alone.

## Goals

- Use desktop width on the screens where it pays: dashboard (charts), plan
  (month calendar), activity detail, activities list, goals.
- Keep the Pista visual language as-is (tokens in `src/app/globals.css`,
  Barlow / Barlow Condensed, 22px cards, track red). This is layout work, not a
  restyle.

## Non-goals

- No changes to the mobile layout. Below the desktop breakpoint every screen
  renders exactly as today.
- No new navigation pattern (no sidebar). The header nav stays as it is, only
  wider.
- No new data features beyond what the plan calendar needs (session done / missed).

## Anti-goals

- Forms stretched across 1280px (long, hard-to-read inputs).
- Charts that get wider but not more readable (e.g. tiny fixed-height plots
  stretched horizontally until bars look like hairlines).
- A desktop calendar that hides information the current mobile plan list shows
  (structure, target pace, edit) with no way to reach it.

## Constraints

- Next.js in this repo has breaking changes vs. common knowledge: read the
  relevant guide in `node_modules/next/dist/docs/` before writing code
  (see `AGENTS.md`).
- Tailwind v4 (`@import "tailwindcss"`, `@theme inline` tokens).
- Desktop breakpoint: **`lg` (1024px)**. Between `sm` and `lg` keep today's
  behaviour (single column, inline header nav).

## Decided

### Page width (shared layout)

- Header and `<main>` in `src/app/(app)/layout.tsx` widen from `max-w-3xl` to
  about **1280px** (`max-w-7xl` or close) at `lg`.
- Form pages stay narrow and centred at about **640px**: Settings, Log,
  New goal, Onboarding. *(Claude's call, user agreed.)* The mechanism (a per-page
  wrapper vs. a layout prop) is the builder's choice.
- Header nav: same component and styling as today, just following the wider
  container.

### Dashboard — "A · Two columns" (user's choice)

At `lg` and up:

- Two columns, about **5/12 left, 7/12 right**.
- **Left, "today":** `RaceHero`, `TodayCard`, the 3 `StatTile`s, the "This week"
  card with `WeekStrip`. Same order as mobile.
- **Right, "charts":** `VolumeBars` full width of the column on top; below it
  `AcwrChart` and `LongRunChart` **side by side**. They stack if the column is too
  narrow for both to read well (the builder picks the exact width at which they stack).
- **Full-width above both columns:** the "awaiting result" prompts and the
  "Suggested changes" (`pendingAdjustments`) card, so they're not lost.
  *(Claude's call, user agreed.)*
- The no-goal state ("Pick your next race") is unchanged.

### Plan — month calendar (user's choice, mockup approved)

At `lg` and up, `/plan` replaces the stacked weekly list with a **month calendar**.
Below `lg` the current list of `SessionCard`s stays exactly as is.

- **Header band:** goal name + `GoalFacts` on the left, `PlanOverview` (weekly km
  by phase, current week marked) on the right. Warnings and the
  regenerate block (`RegenerateButton` + its explanation) stay with it, below.
- **Month navigation:** one month at a time, `‹` / `›` buttons, a "Today" button.
  Opens on the current month. Navigation is URL-driven (e.g. `?month=2026-10`)
  so it works server-side and is linkable *(Claude's call)*. Prev/next are limited to
  months that contain plan sessions *(Claude's call)*.
- **Grid:** 7 day columns in the user's `settings.weekStart` order, with real dates.
  Days from adjacent months are shown dimmed (with their sessions). Rows are calendar
  weeks.
- **Day cell:** day number, session type label, target km. Quality sessions
  (tempo / intervals / race_pace / race, the `HARD` set in `session-card.tsx`) get a
  red left border, long runs an ink left border, and rest days are transparent with
  "Rest" in muted. Past days are dimmed and today gets a red ring. Race day is a
  solid red block. Quality sessions with structure may show a small `StructureBar`.
- **Done / missed marks on past days:** ✓ when an activity is linked to the
  session (`activity.plannedSessionId`), ! when a non-rest session in the past has no
  linked activity. This needs the plan page to load which sessions have a linked
  activity, which it doesn't do today.
- **Unlinked runs are shown too** (user's choice). Any activity in the visible range
  that isn't linked to a session appears in the cell of the day it was run, as a
  compact "Run · N km" line, visually secondary to planned sessions. It links to
  `/activities/[id]`. This covers runs moved by a day, or run on rest or empty days. So
  the page loads the activities for the visible date range, not just a "has linked
  activity" flag. The missed rule above doesn't change: a session moved by a day keeps
  its "!", and the run shows next to it on the day it happened.
- **Several sessions on one day:** the schema allows it (for example after a move). The
  cell lists each session with its own link to its session page. The border follows
  the "hardest" one (quality > long > other). *(Claude's call.)*
- **Week column** on the right of each row: week number within the plan, phase
  (phase colour as left border), and **done km / planned km**. Done km is **all runs in
  the week** (`actualKm` from `weeklyVolume` in `src/lib/metrics/volume.ts`), the same
  number as the dashboard's "This week" and `VolumeBars`, so both screens agree
  *(Claude's call)*. The current week is highlighted. Weeks outside the plan show nothing.
- **Click a day →** the existing session page `/plan/sessions/[id]`, which already has
  the full detail and edit form *(Claude's call)*. There's no inline expansion inside cells.
- **Adjustment history:** a full-width card below the calendar, as today.
- Days with no session (outside the plan, or not scheduled) are empty cells.

### Activity detail

At `lg`: the 4 `StatTile`s in a row on top (already `sm:grid-cols-4`), then two
columns:
- **Left:** Route map (larger) and Splits table.
- **Right:** Planned session, "How did it feel?" form, HR chart, zone bars.
- Delete button and the "add HR in settings" note at the bottom, full width.

### Activities list

At `lg`, `ActivityRow` becomes a row with **aligned columns**: date, session type,
distance, time, pace, avg HR, RPE. This makes runs easier to compare. Mobile keeps the
current row layout. Could be a `<table>` or a CSS grid; the builder picks.

### Goals

- `/goals`: "Current" and "History" cards side by side at `lg`.
- `/goals/[id]`: the edit form (narrow) on the left; status, "Log your result" and
  goal facts on the right.

## Left to the builder

- Exact Tailwind classes, column ratios (as long as they're close to the above),
  gaps, and the stacking width for the two small dashboard charts.
- Whether charts need a taller plot area at desktop sizes to read well. Check
  `chart-frame.tsx` and each chart's sizing.
- How form pages opt into the narrow width.
- Query shape for "session has linked activity" (DAL addition in
  `src/server/dal/sessions.ts` or `activities.ts`, or reuse of an existing service).
- Calendar component structure (server component is preferred; the month navigation
  is just links).
- Test coverage: unit tests for the month-grid building and the done/missed logic.
  Check the e2e `journey.spec.ts` still passes at its viewport, and add a desktop
  viewport check if it's cheap.

## Reference

- Mockups (local, not committed): `.superpowers/brainstorm/*/content/dashboard-layout.html`,
  `plan-month.html`.
- Visual language: Pista tokens in `src/app/globals.css`.
