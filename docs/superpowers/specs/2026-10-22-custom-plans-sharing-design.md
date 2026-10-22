# Custom workouts, custom plans & sharing — design

Date: 2026-10-22 · Status: draft for review

## Why

Today the only way to get a plan is to create a goal and let the generator
build it; a planned session can only be tweaked (date, type, distance, notes).
There is no way to *write* a workout or a plan, and nothing can be shared
between users.

The owner wants the app to work for someone who plans for someone else — a
friend helping a friend, or a coach with athletes: build a structured plan,
send it, and (if the athlete agrees) watch how it's going. The same tools
should serve a runner who simply wants to plan their own training by hand.

Success: a coach can build an 8-week plan on a laptop in a few minutes,
paste a link into WhatsApp, and the athlete — even without an account — can
look at it, sign up, and be following it on their dashboard right away.

## Goals

1. **Workout editor** — build a structured workout from blocks.
2. **My workouts** — a personal library of saved workouts to reuse.
3. **Plan builder** — a multi-week plan made of weeks × 7 days of workouts,
   built mainly by duplicating and editing weeks. Desktop-first, works on mobile.
4. **Plans as an alternative to goals** — a user's single "active thing" is
   either a goal (with its generated plan, as today) or a custom plan.
5. **Share a plan by link** — public read-only page; "Follow this plan" works
   with or without an account; followers receive the author's later changes.
6. **Optional progress sharing** — the athlete chooses whether, and how much,
   of their progress the plan author (or anyone they invite) can see.

## Non-goals (for now)

- Nested repeats (e.g. 3 × (4 × 400)). The model must not rule them out later.
- Typing workouts as text and parsing them (option A in brainstorming was rejected
  in favour of the block editor).
- A public plan marketplace/search. Plans are reachable only via their link.
- Comments, chat or messaging between coach and athlete.
- Automatic weekly adaptation of custom plans (see "Adaptation").
- Translating the app. UI copy is English like the rest of the app; the Spanish
  mockups were only for discussion.

## Anti-goals (would be a failure even if it works)

- An athlete's data visible to anyone they didn't explicitly choose. Progress
  sharing is **off by default**, per person, revocable at any time.
- The author's edits rewriting an athlete's history or overriding sessions
  the athlete edited themselves.
- Breaking the existing goal flow: users who never touch custom plans see the
  app behave exactly as today.
- The public plan page leaking anything beyond the plan itself and the author's
  display name (no email, no activities).

## Concepts

- **Workout** — an ordered list of blocks (see Workout editor). Saved workouts
  live in the owner's **My workouts** library. When a workout is placed on a
  plan day, the plan stores **a copy** of it; editing a library workout later
  does not change plans that already used it (and vice versa — the editor offers
  "Save to My workouts" for a plan-day workout).
- **Custom plan** — owned by its author: name, optional description, an
  ordered list of weeks, each with 7 day slots (Mon…Sun, ISO 1–7) holding zero
  or more workouts (normally one; a day with none is rest). Weeks are relative,
  not dated. There is no draft/published state: a plan is always editable by
  its author.
- **Plan follow** (name is the builder's call) — one user following one plan:
  the follower, the plan, the start date they chose, and their
  progress-sharing level towards the author.
- **Active thing** — each user has at most one active item: an active goal
  (today's behaviour) **or** an active followed/own custom plan. Activating one
  deactivates the other, exactly like switching goals today (nothing deleted).
  Following your *own* plan is how an author trains on it themselves.

## Workout editor (chosen: "B · blocks with controls")

A workout is a vertical list of blocks; each block is edited with steppers and
small selects, not free text. Block kinds:

| Block | Measured by | Target (optional) |
|---|---|---|
| Warm-up | distance or time | — (easy implied) / RPE |
| Run (steady) | distance or time | pace, HR zone, or RPE |
| Repeat N× | contains: one rep (distance or time + target) and one recovery (time or distance, jog/walk/stand) | per rep: pace, HR zone, or RPE |
| Cool-down | distance or time | — / RPE |

- Target selector per block: **Pace** (min:s per km/mi in the user's units) ·
  **Zone** (the app's HR zones Z1–Z5) · **RPE** (1–10). One target per block.
- A live **structure bar** (the same visual language as `StructureBar` on the
  session page) and an **estimated total** (km and minutes). Estimates for
  time-based or RPE/zone blocks use the follower's easy/target paces when known,
  else a sensible default pace; the builder decides the exact formula and must
  label estimates as "≈".
- Workouts have a name and a session **type** (easy / long / tempo / intervals /
  race pace / strides / race / rest — the existing `SESSION_TYPES`) so the rest
  of the app (colours, hard-day logic, dashboard) keeps working.
- "+ Block" and "+ Repeat" add blocks; blocks can be reordered and deleted.
- The existing `SessionStructure` / `StructureStep` types already cover most of
  this (reps by distance or time, zone/pace/effort). The builder extends them
  for time-based warm-up/cool-down/steady blocks, distance-based recovery, and
  HR-zone and RPE targets, keeping generated plans' existing data valid.

## Plan builder

### Desktop (≥ `lg`, the app's desktop breakpoint) — three columns

Approved mockup: `.superpowers/brainstorm/40350-1792652117/content/plan-desktop.html`.

- **Header:** breadcrumb "My plans ›", plan name (editable), summary
  (n weeks · runs/week), actions **Preview** · **Share** · **Activate**.
- **Left — Weeks:** list of weeks with their km; **each week row has its own
  "Duplicate" action** that inserts the copy directly after it. "+ Empty week"
  at the bottom. Weeks can be deleted and reordered. Below, a mini volume
  profile (planned km per week; selected week highlighted in track red).
- **Centre — Selected week:** title with totals (km · time · number of quality
  sessions), prev/next week navigation, 7 day columns. Each workout card shows
  name, distance + main target, and a mini structure bar. Empty days show
  "+ workout". Below the grid, **My workouts** chips that can be dragged onto a
  day, plus "+ New workout".
- **Right — Editor:** the workout editor for the selected card, editing in
  place (card updates live). Header shows "Day · week n", Duplicate and Remove.
  "Save to My workouts" checkbox/action.
- Workouts can be moved between days by drag and drop; a keyboard/tap
  alternative (e.g. "Move to…") is required for accessibility and mobile.

### Mobile

Same content stacked: week list (horizontal or vertical), then the selected
week as a day list, and tapping a workout opens the editor full-screen.
Drag-and-drop is replaced by "Add from My workouts" and "Move to…" actions.

### Validation / limits

No volume rules are imposed on custom plans (the 10 % rule, long-run caps etc.
are generator rules, not constraints on what a coach writes). Reasonable input
limits only (e.g. ≤ 52 weeks, sane rep counts and distances).

## Activating and following a plan

- Activating asks for a **start date** (default: next week-start day, per the
  user's `weekStart` setting; any date allowed, including today mid-week). Week
  1 day 1 maps to the start date's week: workouts are placed on the matching
  weekdays; days before the start date in a partial first week are skipped.
- On activation, the plan's workouts become the user's dated planned sessions
  (so dashboard, plan calendar, today card, activity matching, compliance,
  volume charts keep working unchanged). How sessions are associated with a
  plan instead of a goal is the builder's call (today `planned_session.goal_id`
  is NOT NULL).
- Dashboard with a custom plan active: no race hero/countdown/prediction; show
  the plan name, "week n of N" and the plan's volume profile instead. The
  builder decides the exact hero for this state, following the Pista look.
- A plan has no end race; after its last week it simply ends. The dashboard
  shows "Plan finished" with a link to My plans / Goals.
- Deactivating or switching keeps past sessions and activities intact.
- **Weekday mapping (call):** plan days are weekday *names* (Mon…Sun) and plan
  weeks are Mon–Sun regardless of the follower's `weekStart`, so the coach's
  "Saturday quality, Sunday long" stays in that order. `weekStart` only affects
  display. The default start date is therefore the next Monday.
- **Session lifecycle (call):** dated sessions exist only while a plan is the
  active thing. Following without activating just adds it to My plans.
  Activating (again) always asks for a start date; future non-frozen sessions
  of that plan are rebuilt from it. Propagation of author changes targets only
  followers who have the plan active; others pick up the latest version when
  they activate.
- **Goals while a plan is active (call):** no goal auto-promotion happens while
  a custom plan is active or when it finishes. Activating a plan moves the
  active goal to `upcoming` and removes its future non-frozen sessions;
  re-activating a goal regenerates its future sessions from today (existing
  regenerate path), so goal and plan sessions never clash on a day.

### Adaptation

Weekly automatic adaptation (`adaptPlan`) does **not** run on custom plans —
the author designed the load on purpose. (Possible later: an informational
notice instead of changes.) Goal plans are unchanged.

## Sharing a plan by link

- **Share** on a plan creates (or shows) its share link. One link per plan,
  usable by many people. The author can **disable** it (and re-enable or
  regenerate). Disabled → the public page says the link is no longer active and
  cannot be followed; existing followers are unaffected.
- **Public page** (no login required): plan name, author display name,
  description, weeks count, volume profile, and every week's days with
  workouts; workouts open read-only to show their blocks. Units: km by default,
  following the viewer's settings if logged in. Nothing else about the author.
- **"Follow this plan"**:
  - Logged in → confirm screen: start date, "Activate now" (default on;
    otherwise the plan is just added to their plans), progress-sharing choice
    towards the author (None / Compliance / Full; default None). If they already
    follow it, show that instead.
  - Logged out → sign up (or sign in) carrying the plan along, then continue.
    For new users onboarding becomes: **Your week** (settings) → **Start this
    plan** (start date + progress sharing; replaces "First goal") → **Plan
    preview** → **Apple Watch sync**. On finish, the plan is active.
- **Author deletes the plan or their account (call):** followers keep
  everything they have — their dated sessions and activities are theirs. The
  plan stays in their My plans as a detached copy marked "No longer updated"
  and can still be activated. Data model must therefore not cascade an author's
  deletion into followers' sessions (per-follower snapshot or equivalent).
- Followed plans appear in the follower's **My plans** under "Shared with me",
  showing the author's name. A follower cannot edit the original; they can
  **Duplicate** it into their own plan (which then no longer receives updates).

### Author updates reach followers

- When the author changes a plan, followers' **future** sessions derived from
  it are updated (added/changed/removed) to match.
- Never touched: sessions dated before today (follower's local date), sessions
  with a linked activity, and sessions the follower edited themselves (same
  "frozen" rule as today, see `docs/decisions.md`).
- The follower sees a notice, e.g. "Ana updated your plan: 2 sessions in
  week 3 changed", with before/after, reusing the adjustment-card pattern. The
  changes are applied (not proposed) — the follower can still edit any session.
- Whether propagation is synchronous on save or batched is the builder's call;
  frequent autosaves in the editor must not spam followers with notices
  (e.g. coalesce per plan per day, or notify on an explicit "Publish changes").

## Progress sharing

- Levels, per viewer:
  - **None** — default.
  - **Compliance** — which sessions were done/missed, weekly planned vs actual
    km, compliance %.
  - **Full** — the above plus each activity: distance, time, pace, HR, RPE,
    notes and splits. **Route maps are a separate toggle, off by default**
    (they reveal where someone lives).
- Granted when following a plan (towards its author), or independently via a
  **"Share my progress" link** in Settings (for a friend, with no plan
  involved). Opening that link requires an account (the viewer must be a user
  so access can be listed and revoked); accepting it adds the sharer to the
  viewer's athletes. The sharer picks the level when creating the link.
  **(call)** This link is single-use and expires after 7 days, so a forwarded
  link can't expose data to someone the athlete never chose; the sharer sees
  who accepted in "Who can see my progress".
- **Grant scope (owner's decision):** a grant is from one person to another,
  not tied to a plan. It covers **all** of the athlete's training (including
  runs outside the plan, and whatever plan or goal they have active) and lasts
  until the athlete revokes it — unfollowing, duplicating or switching plans
  does not end it. A follow-time grant and a link grant are the same thing.
- **Settings → "Who can see my progress"**: each person, their level (editable),
  route toggle, **Revoke**. Revoking is immediate.
- **My athletes** (for anyone with at least one person sharing with them): one
  card per athlete — name, active plan, this week's compliance, last activity.
  Opening an athlete shows a read-only view of their plan calendar and, at
  Full level, their activities (reusing existing activity/plan components in a
  read-only mode). Viewers never see anything above the granted level.
- Tenancy: this is the first cross-user read in the app. All cross-user access
  must go through an explicit, tested grant check in the data-access layer; the
  tenancy test suite must cover: no grant → 404; Compliance grant → no
  activity details; revoked grant → 404; route hidden unless toggled.

## Navigation

- **Plan** tab keeps showing the active plan's calendar. It gains entry points
  to **My plans** (own + shared with me), **My workouts**, and **My athletes**
  (only when relevant). Exact placement is the builder's call, without
  introducing a new navigation pattern (no sidebar — see desktop-layout spec).
- Goals stay as they are; the goals list shows that a custom plan is active
  when that's the case.

## Phasing (each phase shippable on its own)

1. **Build & follow your own plans:** workout editor, My workouts, plan
   builder (desktop + mobile), activate a custom plan, dashboard/plan screens
   working with a custom plan active, adaptation skipped.
2. **Share plans:** share link, public page, follow (logged in and via
   sign-up/onboarding), Shared with me, duplicate, author updates propagating
   with notices.
3. **Progress sharing:** levels at follow time, "Share my progress" link,
   Settings management and revoke, My athletes views, tenancy tests.

## Decided by the owner

- Workout editor is the block editor with controls (option B).
- Plans are built week by week; every week has its own Duplicate.
- The plan builder must be designed for desktop first (approved 3-column layout).
- A user has one active thing: a goal (with generated plan) or a custom plan.
- Plans are shared by link; the link opens without an account; following it
  leads into sign-up and onboarding that starts the user on that plan.
- Author changes reach followers.
- Progress sharing is optional; when granted it covers all the athlete's
  training until they revoke it.

## Calls made during design (owner can override)

- Weeks are relative; the start date is chosen on activation.
- Author changes affect only future, non-frozen sessions and come with a notice.
- One reusable, revocable share link per plan.
- Progress sharing: three levels, default None; route maps a separate toggle,
  off by default; can also be shared without a plan via a link.
- Library workouts are copied into plans (no live link).
- No automatic adaptation on custom plans; no volume rules on custom plans.
- HR-zone and RPE targets in addition to pace.
- No nested repeats in v1.
- Plan weekdays are kept by name (Mon–Sun weeks) regardless of `weekStart`.
- Sessions exist only while a plan is active; re-activating asks for a start
  date; author changes propagate only to followers with the plan active.
- No goal auto-promotion while a plan is active; switching between goal and
  plan clears/regenerates future sessions so they never clash.
- If the author deletes the plan or account, followers keep a detached copy.
- "Share my progress" link: single-use, expires in 7 days.

## Left to the builder

Data model and migrations, how sessions link to a custom plan vs a goal, the
structure-type extension, propagation mechanics and notice batching, URL
shapes, estimate formulas, exact dashboard hero for custom plans, component
breakdown, and test plan (property tests for week→date mapping and
propagation's frozen-session rules; e2e for build → share → follow via sign-up).
