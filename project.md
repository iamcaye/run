# Project: Race Training Tracker (multi-user)

Build a multi-user web app where runners plan and track training for their own race goals. Each user configures one or more goals (distance, date, target), gets a generated, adaptive training plan, and syncs workouts from their Apple Watch via the iOS app **Health Auto Export** (REST API automation). Mobile-first, installable as a PWA. There is no Strava integration.

## Stack
- Next.js (App Router) + TypeScript (strict), deployed on Vercel
- Postgres + Drizzle ORM (local dev via Docker Compose)
- Auth: Better Auth (email + password), with sessions in Postgres
- Zod for all external input validation
- Tailwind CSS, Recharts, Leaflet + OSM tiles
- Vitest + fast-check (property-based tests) for domain logic; Playwright for critical e2e flows

## Multi-tenancy & security
- Every user-owned table has a `userId`. All data access goes through a data-access layer that **requires** the current userId. Never query user data without it.
- A test suite tries to access another user's resources and asserts 404/403.
- Per-user import tokens: store only a hash and show the token once on creation. Rate-limit the import endpoint per token.
- The cron endpoint is protected by `CRON_SECRET`.
- Account deletion cascades to all of the user's data, including raw imports.

## User settings
- Display name, timezone (IANA, default Europe/Madrid), units (km/mi), week start day
- Availability: runDays (weekdays), longRunDay, maxRunsPerWeek
- Optional maxHr / restHr (for HR zones via Karvonen); without them, rely on RPE

## Goals (configurable)
- Multiple goals per user; exactly one is **active** (it drives the dashboard and plan)
- Fields: name, raceDate, distanceKm (presets 5K / 10K / Half / Marathon or custom), goalType (`finish | target_time`), targetTimeSeconds (required for target_time), startWeeklyKm, level (`beginner | intermediate | advanced`), notes
- Status: `upcoming | active | completed | abandoned`. After race day, prompt the user for the official result and mark the goal completed.
- Editing the date, target or availability → offer to regenerate **future** sessions only

## Data model
- Better Auth tables (`user`, `session`, `account`)
- `user_settings`: userId, timezone, units, weekStart, runDays int[], longRunDay, maxRunsPerWeek, maxHr, restHr
- `goal`: id, userId, name, raceDate, distanceKm, goalType, targetTimeSeconds, startWeeklyKm, level, status, resultTimeSeconds, notes
- `planned_session`: id, userId, goalId, date, weekIndex, phase (`base | build | specific | taper | race`), type (`easy | long | tempo | intervals | race_pace | strides | race | rest`), targetKm, targetPaceSecPerKm (nullable), effortDescription, structure (jsonb, e.g. warmup/reps/recovery/cooldown), isUserEdited bool
- `activity`: id, userId, externalId, source (`healthkit | manual`), startAt, km, seconds, avgHr, maxHr, rpe, plannedSessionId, notes. Unique on (userId, externalId).
- `route_point`: activityId, idx, lat, lon, altitude, timestamp
- `import_token`: id, userId, name, tokenHash, lastUsedAt, createdAt, revokedAt
- `raw_import`: id, userId, tokenId, receivedAt, payload jsonb, status (`pending | processed | failed`), error
- `plan_adjustment_run`: userId, goalId, weekStart, status, startedAt, finishedAt, error. Unique on (userId, goalId, weekStart).
- `plan_adjustment`: id, userId, goalId, runWeekStart, rule, reason (human-readable), changes jsonb (before/after per session), status (`proposed | accepted | rejected`), createdAt

## Health Auto Export import
- `POST /api/health-import` with the header `Authorization: Bearer <user import token>`. The token resolves the user.
- Settings page: create, name and revoke tokens, plus a copyable setup guide (endpoint URL, header, and recommended config: JSON, Workouts only, include route + HR, last 7 days).
- Persist the raw payload BEFORE parsing; mark it processed or failed with the error.
- Zod schema with `.passthrough()`. Expected shape: `{ data: { workouts: [{ id, name, start, end, duration, distance: {qty, units}, avgHeartRate?, maxHeartRate?, heartRateData?, route? }] } }`. Field names may vary by export version, so isolate the mapping in `mapWorkout()` and test it with fixture payloads.
- Import only running workouts (/run/i). Normalize units and parse dates like `"2026-10-18 08:02:11 +0200"` robustly.
- **Idempotent** upsert by (userId, externalId); the app re-sends overlapping ranges.
- Match each activity to the active goal's planned session on the same local date (user timezone); if several match, pick the closest targetKm.
- Show last sync and recent import errors in Settings. Script: `pnpm reprocess [--user <id>]`.

## Plan generator (`lib/planning`, pure and deterministic, no AI)
`generatePlan({ goal, settings, startDate, existingSessions? }): PlannedSessionDraft[]`, built as a pipeline of small pure functions:

1. **buildWeekGrid**: weeks from startDate to raceDate aligned to weekStart; race week is last. If there are fewer weeks than the minimum for the distance (5K: 6, 10K: 8, Half: 10, Marathon: 14), generate a compressed plan and return a warning. If there are more than ~20 weeks, the extra weeks go to a leading `base` maintenance block.
2. **allocatePhases**: fixed taper by distance (5K/10K: 1 week, Half: 2, Marathon: 3). The remaining weeks are split roughly 35% base / 35% build / 30% specific; low starting volume shifts weight to base.
3. **buildVolumeCurve**:
   - Peak weekly km from a table by distance × level (e.g. Half: beginner ~35, intermediate ~45–50, advanced ~60+; define 5K/10K/Marathon similarly in a config file).
   - Clamp the peak to what is reachable from startWeeklyKm with ≤10% weekly increases.
   - 3:1 cycles (3 up, 1 deload at 75–80%); no deload in the last block before the taper.
   - Taper: the week before race week at 70–75% of peak and race week ~50% including the race (adapt for 3-week marathon tapers).
4. **sessionTemplate(phase, level)**: base = easy runs + long run + strides/short hills at most; build = 1–2 quality sessions (tempo, intervals) + long; specific = race-pace work (inside the long run or standalone); taper = keep intensity and cut volume. Beginners get at most 1 quality session per week. Easy runs fill the rest.
5. **assignDays**: long run on longRunDay; quality as far from the long run as possible, never the day before or after it, and never two hard days in a row. Easy runs fill the other runDays up to maxRunsPerWeek. If days are short, drop easy runs first and sacrifice quality/long only last.
6. **sizeSessions**: long run at 25–35% of weekly km, +1–2 km/week max, capped per distance (5K ~10, 10K ~14, Half ~19–20, Marathon ~32). Quality sessions have a fixed structure (warmup + main set + cooldown) stored in `structure`. Easy runs split the remainder evenly, rounded to 0.5 km.
7. **derivePaces**: race pace = targetTime / distance. Use Riegel (`T2 = T1 × (D2/D1)^1.06`) for equivalent 5K/10K/15K paces. Easy = RP + 60–90 s/km; long = RP + 45–75 s/km; tempo/threshold ≈ 15K–10K equivalent pace; intervals ≈ 5K equivalent pace. For `finish` goals, use effortDescription (RPE-based) instead of paces, or estimate paces from recent activities if any exist.
8. **Regeneration** never modifies past sessions or `isUserEdited` sessions.

Property-based tests (fast-check) with these invariants: no week exceeds +10% over the previous non-deload week; the long run never exceeds the distance cap; no hard days back-to-back; no hard day adjacent to the long run; sessions only on runDays; weekly runs ≤ maxRunsPerWeek; race week contains the race on raceDate. Add example-based tests for each distance × level and for short lead times.

## Weekly adaptation (`lib/planning/adapt.ts`, pure)
`adaptPlan(ctx: { goal, settings, sessions, activities, weekStart }): PlanAdjustment[]`. Rules applied to **future** sessions only, never touching `isUserEdited`:
- Compliance <70% two weeks in a row → repeat the current week's load instead of progressing
- ACWR >1.5 → next week at 85% volume and remove one quality session
- >7 days with no runs → step back 1–2 weeks on the volume curve
- Missed long run → do not make it up or stack it; continue the plan
- Recent quality sessions consistently faster than target → create a *suggestion* to review the goal (no automatic change)

Each adjustment carries a human-readable `reason`, and the user sees it as a proposal ("I lowered this week because…") with accept/reject. Accepting applies the `changes`.

## Metrics (`lib/metrics`, pure + tests)
- sRPE load = minutes × RPE
- ACWR = 7-day acute / 28-day chronic rolling load; flag >1.5 or <0.8
- Weekly volume planned vs actual; compliance % per week
- Race prediction for the goal distance via Riegel from the best comparable effort in the last 6 weeks
- HR zones and time-in-zone when HR data and settings exist
- All "day/week" logic uses the user's timezone

## Scheduled job (weekly adaptation)
- Vercel Cron **hourly**: `GET /api/cron/adapt-plans`, protected by `Authorization: Bearer ${CRON_SECRET}`; config in `vercel.json` (`"0 * * * *"`).
- Each run: find users whose week has just closed **in their own timezone** (e.g. it is past Monday 03:00 local) and who have no `plan_adjustment_run` for (active goal, weekStart).
- Claim the run via `INSERT ... ON CONFLICT DO NOTHING`, run `adaptPlan`, save the proposed adjustments, and mark the run done or failed. Failed or unclaimed runs get picked up next hour, so no extra retry logic is needed.
- Process users with bounded concurrency (e.g. p-limit 5) and `Promise.allSettled`; return a summary JSON.
- **On-demand fallback**: the same function, with the same idempotency, is triggered when the dashboard loads if the user's last closed week has no run yet.
- Keep the job logic in a plain service (`services/weekly-adaptation.ts`) so it can later move to Inngest/Trigger.dev unchanged.

## Pages
1. **Onboarding**: account → settings (timezone, units, availability) → first goal → plan preview (with warnings) → Health Auto Export setup + token
2. **Dashboard** (active goal): countdown, current phase, this week's sessions (done/missed/upcoming), pending adjustment proposals, weekly volume chart, ACWR chart with a risk band, prediction vs target, long run progression
3. **Goals**: list, create/edit, switch active, log results, history
4. **Plan**: week/calendar view with session details (structure, paces/effort), edit/move sessions (sets isUserEdited), regenerate future sessions, adjustment history
5. **Activities**: list + detail (stats, splits, HR, route map), linked planned session
6. **Quick log**: mobile form to add RPE/notes to the latest activity or log a manual run
7. **Settings**: profile, units, availability, HR, import tokens + sync status, delete account

## Quality bar
- Strict TS with no `any`. Domain logic lives in pure functions (`lib/planning`, `lib/metrics`, `lib/import`), separated from routes/UI. The data-access layer enforces tenancy.
- Store metric internally and convert at the display layer only
- All tunable numbers (peaks, caps, phase splits, pace offsets, adaptation thresholds) live in one typed config module
- Seed: 2 demo users (10K beginner, half marathon intermediate) with realistic plans, activities and one pending adjustment
- README: local setup, env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET`…), migrations, deployment (Vercel + Neon/Supabase), how to trigger the cron locally, and an end-user Health Auto Export guide

## Process
Work in phases and stop for my review after each one:
1. Scaffold, Docker Compose, Drizzle schema + migrations, Better Auth, data-access layer + tenancy tests, config module, seed
2. Settings + Goals CRUD + onboarding skeleton
3. `lib/planning` generator (all 8 steps) + property and example tests + Plan page (view/edit/regenerate)
4. Import tokens, the import endpoint, `mapWorkout` + fixtures, activity matching, sync status UI
5. `lib/metrics` + tests + Dashboard
6. `adaptPlan` + tests, the cron endpoint + weekly adaptation service + on-demand fallback, adjustment proposals UI
7. Activities, Quick log, PWA, README, Playwright e2e: signup → goal → plan → import → dashboard → adjustment accepted

Before writing code, propose the folder structure, any deviations from this spec, and any ambiguities, then wait for my OK.
