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

## Fixtures
- Health Auto Export fixtures are provisional (`src/lib/import/__fixtures__/hae/provisional-*.json`) until a real anonymized payload arrives.
