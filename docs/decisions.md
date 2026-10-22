# Decisions & deviations from `project.md`

Agreed before Phase 1 (2026-10-18).

## Schema
- Better Auth's `verification` table is included. The display name is Better Auth's `user.name` (not in `user_settings`).
- `route_point` carries `userId` so every user-owned table follows the tenancy rule and cascades directly.
- `activity.hrSeries` (jsonb `[{t, bpm}]`) stores HR samples for time-in-zone; `activity.rawImportId` links to the source import.
- Manual activities use `externalId = "manual:<uuid>"`.
- One active goal per user: partial unique index `goal(user_id) WHERE status = 'active'`. Activating a goal moves the previous one to `upcoming`.
- `raw_import.payloadBytes` is always recorded; `payload` is null when rejected before storage (e.g. 413).
- `rate_limit` (fixed-window counters in Postgres) — the only non-user-owned app table.
- `plan_adjustment.status` gains `superseded`. On accept, each change's `before` is compared with the current session; drifted sessions are skipped and reported.
- Weekdays are ISO (1 = Mon … 7 = Sun). Local calendar dates are Postgres `date` handled as `YYYY-MM-DD` strings.
- Custom plans (migration `0002_custom_plans`): `workout` (library), `custom_plan` (doc jsonb + optimistic `version`, bumped on every save; a stale save returns `"conflict"`), `plan_follow` (a user following a plan from `startDate`, with a `snapshot` of the doc; `custom_plan_id` is `ON DELETE SET NULL` so deleting a plan keeps its follow and sessions). One follow per (user, plan) and at most one active follow per user, both partial unique indexes.
- `planned_session` belongs to a goal **or** a follow: `goal_id` is nullable, `follow_id` added (cascade), and the check `planned_session_one_owner_chk` requires exactly one. The DAL takes a `SessionOwner` (`{ goalId } | { followId }`; `ownerOf(session)` derives it). `phase` is nullable — custom-plan sessions have no periodisation phase. `source_key` records the plan slot a follow session was synced from.
- A user has one active plan at a time across both tables: activating a follow moves the active goal to `upcoming` and other follows to `inactive`; activating a goal sets the active follow `inactive` — each in one transaction.

## Tenancy
- All user data goes through `forUser(userId)` (`src/server/dal`). ESLint forbids importing the raw db elsewhere (allowed: `server/dal`, `server/system`, `server/db`, `server/auth`, `services`, `test`, `scripts`).
- Not-owned rows read as `null` → pages use `notFound()`, routes return 404 (not 403, to avoid leaking existence).
- Writes that reference another user-owned row (goalId, plannedSessionId, rawImportId) check ownership and throw `NotOwnedError`.

## Planning
- Taper count **includes** race week (phase `race`): 5K/10K race week ~55%; Half 72% → 50%; Marathon 85% → 72% → 50% (fractions of peak, in `config/training.ts`).
- A session is frozen (never touched by regeneration/adaptation) if `date < today (local)`, it has a linked activity, or `isUserEdited`.
- Compressed plans cut base first, then build; taper + race week always kept. Plans start today (local); the first week may be partial.

## Metrics & adaptation
- ACWR: acute = 7-day sum; chronic = 28-day sum / 4.
- Missing RPE → estimated from HR (if HR settings exist) or a per-session-type default; flagged as estimated.
- Compliance = Σ min(actual, planned) / Σ planned km.
- Rule precedence: inactivity gap > ACWR > compliance; at most one volume rule per week. The goal-review suggestion is independent.
- "Step back on the curve" = rebuild future volume from the reduced level with ≤10% steps; lower the peak if unreachable.
- A week closes on the user's `weekStart` day at 03:00 local.

## Infrastructure
- Vercel Hobby → cron runs **daily**; the on-demand dashboard fallback covers the gap. The due-users query stays timezone-aware so hourly is just a `vercel.json` change (needs Pro, or an external scheduler).
- Next.js 16 `cacheComponents` is disabled: nearly every page is per-user and request-time.
- Postgres in Docker is exposed on **5434** (5432 was taken locally). Tests use a separate `run_test` database.
- Import requests are processed synchronously (store raw → parse → upsert). Payloads over 4 MB get a 413 with a hint to enable HAE batch requests.

## Auth & email
- No email verification in v1. Password reset works via an `EmailSender` interface: `ConsoleEmailSender` (default) or `ResendEmailSender` when `RESEND_API_KEY` is set.

## PWA
- v1: installable with an app-shell cache and a friendly offline state. Offline quick-logging is v2.

## Goals & onboarding (Phase 2)
- A user's first goal becomes active automatically; later goals are `upcoming` unless "Make active" is ticked.
- When the active goal is completed, abandoned or deleted, the soonest *future* upcoming goal is promoted automatically (none → no active goal; the dashboard offers to create one).
- `upcoming` and `abandoned` goals can be (re)activated; `completed` cannot.
- A result can be logged from race day onwards; the "log your result" prompt shows from the day after.
- Goal edits that change date/distance/type/target/start volume/level, and availability or week-start changes, return `planAffected`; the UI shows a notice. The actual "regenerate future sessions" action is wired in Phase 3.
- Onboarding completion is tracked in `user_settings.onboarding_completed_at`; `/dashboard` redirects to `/onboarding` until it's set. The onboarding settings step pre-selects the browser's time zone.
- Forms submit via `useFormAction` (onSubmit + transition) rather than `<form action>`, so React doesn't reset fields on validation errors.
- Display name lives in Better Auth's `user.name`; account deletion uses Better Auth's `deleteUser` (password required).

## Plan generator (Phase 3)
- `generatePlan` returns `{ sessions, weeks, warnings, peakKm, deleteIds }` instead of a bare array: week summaries carry the volume targets the 10% invariant is checked against; warnings are typed codes rendered by `lib/planning/describe.ts`.
- Race week is exempt from the +10% rule (a marathon alone exceeds 50% of peak). Progression rounds *down* to 0.5 km so rounding never breaks the rule. Week-1 volume has a floor (`minStartWeeklyKm`, 8 km) so tiny starting volumes can progress.
- Maintenance weeks (lead time > 20 weeks) hold the starting volume flat.
- Long-run share: 35% for half/marathon; 5K/10K 35/30/25% for ≤3/4/≥5 runs. Long ≤ cap and ≤ +2 km over the longest long run so far. Easy runs never exceed 85% of the week's long run (excess volume is left out rather than piled onto easy days).
- A partial first week with ≤2 usable days gets easy runs only. Race-week shakeouts may be 2 km.
- Spacing rules hold across week boundaries: all long-run dates (and the race date) are fixed before quality days are placed.
- Regeneration builds *around* kept (past / user-edited / completed) sessions: they occupy their day, consume run slots and weekly km, satisfy a matching quality/long slot, and anchor the spacing rules. Long-run share and quality sizes still come from the full week's target. The curve keeps the plan's original start date so week numbering is stable.
- A plan is generated when a goal becomes active (created as first goal, switched to, or promoted) and it has no sessions yet. Upcoming goals have no plan.
- Plan warnings shown on the Plan page are recomputed from the plan's start date (generation is deterministic).
- Editing a session (date, type, distance, notes) sets `isUserEdited`; changing the type clears its structure and re-derives the target pace. Two sessions can't share a day.

## Health Auto Export import (Phase 4)
- Tokens: `rtt_` + 32 random bytes (base64url); only the SHA-256 is stored. `server/system/import-tokens.ts` is the single cross-tenant lookup (token → user); everything after that runs through `forUser(userId)`.
- Order of checks: token (401) → per-token rate limit, 30 req / 10 min, Postgres fixed window (429 + `Retry-After`) → size (413 by `Content-Length` or actual body > 4 MB, recorded in `raw_import` with `payloadBytes` and no payload) → store raw → process.
- "Persist before parsing": the body must be JSON to fit a jsonb column; invalid JSON is recorded as a failed raw import without payload (400). Any JSON is stored as received before workouts are mapped; an unexpected envelope is stored and marked failed (400).
- Per-workout tolerance: non-runs are skipped; unreadable runs are reported in the response and in `raw_import.error` while the rest import (status `processed`). Zero readable runs → `failed`. Settings' "recent import errors" shows both.
- `mapWorkout` reads both current (`{qty, units}`, `lat/lon`) and legacy (plain numbers + `distanceUnits`, `latitude/longitude`, `heartRate.avg`) fields; duration prefers `duration` (excludes pauses) over end − start; a missing id falls back to a hash of name + start so re-sends stay idempotent. Dates without an offset are read in the user's time zone.
- Re-imports keep user-entered RPE/notes and an existing session link; a re-send without a route never wipes a stored route.
- Matching only links to sessions of the **active** goal, skips rest days and sessions already claimed by another activity (one activity per session).
- Requests are processed synchronously; the response includes counts (`imported`, `skipped`, `invalid`, `matched`).
- `pnpm reprocess [--user <id>]` re-runs stored payloads oldest-first (idempotent).
- The seed builds HAE-format payloads for past planned sessions and sends them through the real pipeline.

## Metrics & dashboard (Phase 5)
- RPE for load: logged → estimated from average HR via heart-rate reserve (piecewise table in config) → session-type default → generic default. The dashboard notes when most recent load is estimated.
- ACWR is **not shown with < 28 days of history** (`insufficientHistory`): with one week of runs it is exactly 4.0 by construction. The tile says "available after 4 weeks of runs"; the chart only plots days with a full window. (Phase 6's ACWR rule should honour the same flag.)
- Race prediction prefers **hard efforts** (linked to tempo/intervals/race-pace/race, logged RPE ≥ 7, or HR ≥ 80% of reserve) with distance ≥ max(3 km, 25% of the goal) in the last 6 weeks; with none it falls back to any comparable run and says it's likely conservative. An easy run predicts easy pace, not race fitness.
- Time-in-zone: each HR sample counts until the next one (last until the end), capped at 5 min per gap.
- Weeks/days in all metrics use local dates computed with the user's time zone (`localDateOf`), so a 23:30 run counts on its own day.
- Charts follow the dataviz method: planned = categorical slot 1 (blue), run = slot 2 (orange), validated pair in both modes (a neutral gray "planned" failed the chroma floor); single-series ACWR without legend; the risk band uses status colours with in-plot text labels; every chart has a hover tooltip and a "Show data" table; no dual axes; prediction vs target is a stat tile, not a chart.
- The seed adds 5 weeks of pre-plan running (and a weekly harder run for the half-marathon user) so ACWR and the prediction have real history.

## Weekly adaptation (Phase 6)
- One volume mechanism for inactivity and low compliance: cap future training weeks at `L₀ × 1.1^i` (i = calendar weeks after the closed week), so the plan restarts from L₀ and rejoins the original curve on its own. Inactivity: L₀ = planned km 1 week back (gap 8–14 days) or 2 weeks back (> 14). Low compliance (< 70% two weeks running): L₀ = the closed week's planned km ("repeat"). Taper and race weeks are never changed.
- ACWR rule only with a full 28-day history; next week scaled to 85% and the last quality session becomes an easy run.
- Precedence: inactivity > ACWR > compliance; at most one volume proposal per week. **No volume rules when the user has no runs at all** (sync probably not set up yet).
- Missed long run: deliberately no rule (never made up or stacked). Tested.
- Scaling touches easy/long/strides only; quality sessions keep their structure; runs never go below 2 km. Kept sessions (past, edited, completed) count toward a week's total but are never changed.
- Goal review: last 3 quality sessions ≥ 3% faster than their **expected average pace** (warm-up/cool-down at easy pace, main set at target) → suggestion with no changes; not repeated within 4 weeks; target-time goals only.
- Accept re-checks each session against `before` inside a transaction (also: still in the future, not edited, no linked run) and reports applied/skipped. A new weekly run supersedes older pending proposals.
- Runs are claimed with an upsert: new rows, failed runs, and runs stuck in `running` > 15 min can be claimed; done/fresh runs can't. The cron and the dashboard fallback call the same service.
- Week close: the user's `weekStart` day at 03:00 local. Proposals are worded "this week" — the job runs as the new week starts.
- Vercel Hobby: `vercel.json` runs the cron daily at 04:00 UTC; users whose week closes later (e.g. the Americas) are picked up by the next run or the dashboard fallback. Hourly: change the schedule to `0 * * * *` (Pro) or call the endpoint from an external scheduler.
- The seed's half-marathon user has a two-week slump, so the real weekly job produces the demo's pending adjustment.

## Activities, Quick log, PWA, e2e (Phase 7)
- Splits are computed from the GPS track (haversine), interpolated at each km and **rescaled to the watch's total distance** (GPS drifts). Shown per km in both unit systems.
- Manual runs: `externalId = manual:<uuid>`, stored at the given local time (default 12:00) in the user's time zone, linked to that day's session with the same matcher as imports (`services/activity-linking.ts`). Only manual runs can be deleted — an imported run would return with the next sync. Pace sanity check: 2:00–20:00 /km.
- Bottom tab bar: Dashboard · Plan · Log · Runs · Settings (five fit a phone); Goals is in the desktop nav and linked from the dashboard.
- Dashboard keeps proposals decided in the last 24 h visible, so the "Applied N changes" outcome doesn't vanish.
- PWA: `app/manifest.ts`, icons rendered with `next/og` (no binaries in the repo), hand-written `public/sw.js` — network-only for pages and data (personal data is never cached), cache-first for hashed `/_next/static` assets, `/offline` fallback for navigations. Registered in production builds only; served with `no-cache`.
- Map: Leaflet + OSM tiles via `react-leaflet`, client-only (`next/dynamic` with `ssr: false`), scroll-zoom off so it doesn't trap page scrolling.
- Playwright runs a production build on :3200 against `TEST_DATABASE_URL`. The journey's arrange step backdates the new user's plan by 5 weeks **directly in the test database** (so closed weeks exist); everything else goes through the UI and the real import endpoint. No test-only code paths in the app.

## Fixtures
- Health Auto Export fixtures are provisional (`src/lib/import/__fixtures__/hae/provisional-*.json`) except `real-v2-es.json`, an anonymized export from a Spanish iPhone.
- HAE sends workout names in the phone's language ("Outdoor Run" arrives as "Exterior Ejecutar"), so runs are recognised by English and Spanish names (`IMPORT.runningWorkoutPattern`). Imports sent before a name was recognised come back with `pnpm reprocess`.
