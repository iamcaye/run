# Race Training Tracker

Multi-user, mobile-first web app for planning and tracking training toward race goals, with Apple Watch workouts synced via the iOS app **Health Auto Export**.

See [`project.md`](./project.md) for the spec and [`docs/decisions.md`](./docs/decisions.md) for agreed deviations.

> Status: **Phase 5** — metrics (`src/lib/metrics`) + Dashboard. Earlier: Health Auto Export import (4); plan generator + Plan page (3); settings, goals, onboarding (2); scaffold, schema, auth, tenancy DAL, config, seed (1).

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
| `TEST_DATABASE_URL` | tests | Separate database for Vitest (wiped data is fine) |
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
pnpm test          # all
pnpm test:unit     # pure domain logic (src/lib)
pnpm test:db       # DAL / tenancy / services against TEST_DATABASE_URL (migrated automatically)
FC_RUNS=5000 pnpm test:unit   # deeper property-based search (default 400 cases per property)
pnpm lint && pnpm typecheck
```

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
  services/      orchestration (import, weekly adaptation)
  test/          test setup, factories, tenancy tests
scripts/         migrate, seed (reprocess later)
drizzle/         generated SQL migrations
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

## Deployment & cron
Filled in during later phases. Note: on Vercel **Hobby** the cron runs once a day; hourly needs **Pro** or an external scheduler (e.g. a GitHub Actions workflow calling the endpoint with `CRON_SECRET`).

## Roadmap (post-v1)
- Offline quick-logging with background sync
- Email verification
