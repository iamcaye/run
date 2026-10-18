# Race Training Tracker

Multi-user, mobile-first web app for planning and tracking training toward race goals, with Apple Watch workouts synced via the iOS app **Health Auto Export**.

See [`project.md`](./project.md) for the spec and [`docs/decisions.md`](./docs/decisions.md) for agreed deviations.

## Features
- **Goals** — several per user, one active; 5K / 10K / half / marathon or custom; finish or target time; log the official result.
- **Adaptive plan** — a deterministic generator (base → build → race-specific → taper) that respects your run days, long-run day and weekly limit, with paces from your target (Riegel) or effort (RPE). Edit or move any session; regenerate the future while keeping what you changed.
- **Apple Watch sync** — via the Health Auto Export app (no Strava): routes, heart rate, idempotent re-sends, matched to the day's session.
- **Dashboard** — countdown, phase, this week's sessions, planned vs run volume, training-load ratio (ACWR) with a risk band, race prediction vs target, long-run progression.
- **Weekly check-in** — after each week, proposals with a plain-English reason (ease back in after a break, lighter week after a load spike, hold the load after missed weeks, review a too-easy goal) that you accept or decline.
- **Runs** — list and detail with splits, heart-rate chart, time in zones (Karvonen) and an OpenStreetMap route.
- **Quick log** — rate your latest run (RPE) or log one by hand, from the home screen (installable PWA).

## Stack
Next.js 16 (App Router) · TypeScript (strict) · Postgres + Drizzle · Better Auth · Zod · Tailwind v4 · Vitest + fast-check · Playwright

## Local setup

Requirements: Node 22+, pnpm 11, Docker.

```bash
pnpm install
cp .env.example .env          # then set BETTER_AUTH_SECRET and CRON_SECRET (see below)
pnpm db:up                    # Postgres 17 on localhost:5434 (+ run_test database)
pnpm db:migrate
pnpm seed                     # two demo users
pnpm dev                      # http://localhost:3000
```

Demo accounts (password `demo-password-123`):

| Email | Profile |
|---|---|
| `demo-10k@example.com` | 10K, beginner, finish goal |
| `demo-half@example.com` | Half marathon, intermediate, 1:45 target |

## Environment variables

| Name | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `TEST_DATABASE_URL` | tests | Separate database for Vitest and Playwright (wiped data is fine) |
| `BETTER_AUTH_SECRET` | yes | ≥32 chars. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Public base URL, e.g. `http://localhost:3000` |
| `CRON_SECRET` | yes | Bearer secret for `/api/cron/adapt-plans`. `openssl rand -hex 32` |
| `RESEND_API_KEY` | no | If set, emails go via Resend; otherwise they're printed to the server console |
| `EMAIL_FROM` | no | Sender for outgoing email |

## Database & migrations

```bash
pnpm db:generate   # after editing src/server/db/schema/*
pnpm db:migrate    # apply migrations in ./drizzle to DATABASE_URL
pnpm db:studio     # browse data
```

## Tests

```bash
pnpm test          # all Vitest suites
pnpm test:unit     # pure domain logic (src/lib), incl. fast-check properties
pnpm test:db       # DAL / tenancy / services / route handlers against TEST_DATABASE_URL (migrated automatically)
FC_RUNS=5000 pnpm test:unit   # deeper property-based search (default 400 cases per property)
pnpm test:e2e      # Playwright: builds the app and runs it against TEST_DATABASE_URL on :3200
pnpm lint && pnpm typecheck
```

First-time Playwright setup: `pnpm exec playwright install chromium`. The e2e journey covers sign-up → onboarding → plan → import → dashboard → accepting a weekly adjustment → quick-log RPE.

`src/test/tenancy.test.ts` verifies that one user can't read, modify, delete or reference another user's data, that every user-owned table has `user_id`, and that account deletion cascades everywhere.

## Password reset (dev)
With no `RESEND_API_KEY`, the reset link is printed in the `pnpm dev` terminal.

## Project layout

```
src/
  app/           routes (auth pages, (app) protected pages, api/)
  components/    UI
  config/        env.ts (validated env), training.ts (ALL tunable numbers)
  lib/           pure domain logic: planning, metrics, import (no db/next imports)
  server/
    db/          Drizzle client + schema
    auth/        Better Auth instance, requireUser()
    dal/         forUser(userId) — the only path to user data
    email/       EmailSender (console / Resend)
    system/      the few cross-tenant lookups (import token → user, cron scheduling)
    actions/     Server Actions (thin: validate → service → revalidate)
  services/      orchestration (plans, import, dashboard, weekly adaptation, activities)
  test/          test setup, factories, tenancy tests
scripts/         migrate, seed, reprocess
e2e/             Playwright journey
drizzle/         generated SQL migrations
public/sw.js     service worker (app shell + offline page; never caches user data)
```

## Syncing workouts from Apple Watch (Health Auto Export)

1. In the app: **Settings → Apple Watch sync → Create** a token for your phone. Copy it — it's shown only once.
2. On the iPhone, install **Health Auto Export** → *Automations* → *New automation* → **REST API**.
3. URL: `https://<your-domain>/api/health-import`. Header: `Authorization: Bearer <token>`.
4. Format **JSON**, data type **Workouts** only, turn on **Include route data** and **Include workout metrics**.
5. Date range **Last 7 days** (re-sending overlapping days is safe), enable **Batch requests**, pick a sync interval.
6. Tap *Manual export* to test; *Settings → Last sync* updates and any errors are listed below it.

Only running workouts are imported. Each run is linked to the planned session on the same day (your time zone).
Revoking a token stops that phone's automation immediately.

Reprocess stored payloads after changing the mapping:

```bash
pnpm reprocess               # all users
pnpm reprocess --user <id>   # one user
```

Test the endpoint locally:

```bash
curl -X POST http://localhost:3000/api/health-import \
  -H "Authorization: Bearer rtt_..." -H "Content-Type: application/json" \
  --data-binary @src/lib/import/__fixtures__/hae/provisional-v2-outdoor-run.json
```

## Weekly adaptation (cron)

`GET /api/cron/adapt-plans` with `Authorization: Bearer $CRON_SECRET` finds users whose week has just closed **in their own time zone** (past 03:00 on their week-start day), claims a run per (goal, week), runs `adaptPlan`, and stores proposals for the user to accept or reject. It's idempotent: call it as often as you like.

```bash
# trigger locally
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/adapt-plans
```

- `vercel.json` schedules it **daily** (`0 4 * * *`), which Vercel Hobby allows. Hourly (`0 * * * *`) needs **Pro**, or call the endpoint from an external scheduler such as a GitHub Actions workflow on a cron with the secret as a repository secret.
- Opening the dashboard runs the same job for that user if their last closed week hasn't been processed yet, so nobody waits for the next cron run.

## Deployment (Vercel + Neon or Supabase)

1. **Database.** Create a Postgres database on [Neon](https://neon.tech) or [Supabase](https://supabase.com). Use the **pooled** connection string (Neon: `-pooler` host; Supabase: the transaction pooler on port 6543). The client sets `prepare: false`, which transaction poolers need.
2. **Migrate** from your machine (or CI) against that database:
   ```bash
   DATABASE_URL="postgres://…" pnpm db:migrate
   ```
   With Supabase's pooler, run migrations against the **direct** (session) connection string instead.
3. **Vercel project.** Import the repo, framework *Next.js*, build command `pnpm build`. Set the environment variables: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your production URL, e.g. `https://training.example.com`), `CRON_SECRET`, and optionally `RESEND_API_KEY` + `EMAIL_FROM` (verify the sender domain in Resend).
4. **Cron.** `vercel.json` registers `/api/cron/adapt-plans`; Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. Hobby: daily. Pro: switch to `0 * * * *`.
5. **Health Auto Export** users point their automation at `https://<your-domain>/api/health-import` (Settings shows the exact URL).
6. Optional: seed demo users in a staging database with `DATABASE_URL=… pnpm seed`. **Never run the seed against production** (it deletes and recreates the demo accounts only, but it's still test data).

Vercel's request body limit is 4.5 MB; the import endpoint answers 413 at 4 MB with a hint to enable *Batch requests* in Health Auto Export.

## Install on your phone (PWA)
Open the site in Safari (iOS) or Chrome (Android) → *Share → Add to Home Screen*. It opens full-screen with a *Quick log* shortcut. Offline, you get a friendly offline page; your watch keeps recording and runs sync when you're back online.

## Roadmap (post-v1)
- Offline quick-logging with background sync
- Email verification (plugs into the existing `EmailSender`)
- Real anonymized Health Auto Export fixtures (current ones are provisional)
- Hourly cron on Vercel Pro
