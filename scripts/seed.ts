/**
 * Seeds two demo users. Re-running replaces them (matched by email).
 *
 * Seeds accounts, settings, goals, plans (started a few weeks ago) and activities imported through
 * the real Health Auto Export pipeline, then runs the weekly adaptation (yielding a real pending
 * adjustment for the half-marathon user).
 */
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import { closeDb, db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { addDays, todayInTz, type IsoWeekday } from "@/lib/time";
import { forUser, type GoalInput, type SettingsPatch } from "@/server/dal";
import { ingestPayload } from "@/services/health-import";
import { ensureWeeklyAdaptation } from "@/services/weekly-adaptation";
import { createImportToken } from "@/services/import-tokens";
import { createPlanIfMissing } from "@/services/plans";
import { demoWorkouts, type DemoRunProfile } from "./seed-activities";

export const DEMO_PASSWORD = "demo-password-123";

type DemoUser = {
  name: string;
  email: string;
  settings: SettingsPatch;
  goal: GoalInput;
  /** The plan started this many days ago. */
  planStartedDaysAgo: number;
  runs: DemoRunProfile;
};

const DEMO_USERS: DemoUser[] = [
  {
    name: "Lucía (10K beginner)",
    email: "demo-10k@example.com",
    settings: {
      timezone: "Europe/Madrid",
      units: "km",
      weekStart: 1,
      runDays: [2, 4, 7],
      longRunDay: 7,
      maxRunsPerWeek: 3,
    },
    goal: {
      name: "San Silvestre-style 10K",
      raceDate: "2027-01-17",
      distanceKm: 10,
      goalType: "finish",
      targetTimeSeconds: null,
      startWeeklyKm: 12,
      level: "beginner",
      notes: "First 10K — just finish strong.",
    },
    planStartedDaysAgo: 8,
    runs: {
      center: { lat: 40.4168, lon: -3.7038 },
      easyPace: 400,
      completion: 0.85,
      seed: 1,
      preplanWeeks: 5,
      preplanHard: null,
      slumpWeeks: 0,
      slumpCompletion: 1,
    },
  },
  {
    name: "Marco (Half intermediate)",
    email: "demo-half@example.com",
    settings: {
      timezone: "Europe/Rome",
      units: "km",
      weekStart: 1,
      runDays: [2, 3, 5, 6, 7],
      longRunDay: 7,
      maxRunsPerWeek: 4,
      maxHr: 188,
      restHr: 52,
    },
    goal: {
      name: "Spring Half Marathon",
      raceDate: "2027-02-14",
      distanceKm: 21.0975,
      goalType: "target_time",
      targetTimeSeconds: 6300, // 1:45:00
      startWeeklyKm: 30,
      level: "intermediate",
      notes: null,
    },
    planStartedDaysAgo: 22,
    runs: {
      center: { lat: 41.9028, lon: 12.4964 },
      easyPace: 360,
      completion: 0.9,
      seed: 2,
      preplanWeeks: 5,
      // A weekly tempo-ish run (HR ≥ 80% of reserve) so the prediction has a hard effort.
      preplanHard: { paceSecPerKm: 292, avgHr: 164, km: 10 },
      // A two-week slump (e.g. a cold) → the weekly check-in proposes holding the load.
      slumpWeeks: 2,
      slumpCompletion: 0.25,
    },
  },
];

async function main() {
  await db()
    .delete(user)
    .where(
      inArray(
        user.email,
        DEMO_USERS.map((u) => u.email),
      ),
    );

  for (const demo of DEMO_USERS) {
    const { user: created } = await auth().api.signUpEmail({
      body: { name: demo.name, email: demo.email, password: DEMO_PASSWORD },
    });
    const scope = forUser(created.id);
    await scope.settings.update({ ...demo.settings, onboardingCompletedAt: new Date() });
    const goal = await scope.goals.create(demo.goal);
    const active = await scope.goals.activate(goal.id);
    if (!active) throw new Error("activate failed");
    const settings = await scope.settings.get();
    const today = todayInTz(settings.timezone);
    const plan = await createPlanIfMissing(scope, active, settings, today, addDays(today, -demo.planStartedDaysAgo));
    const sessions = await scope.sessions.listForGoal(active.id);
    const { summary: token } = await createImportToken(scope, "Demo iPhone");
    const payload = JSON.stringify({
      data: {
        workouts: demoWorkouts({
          sessions,
          today,
          timeZone: settings.timezone,
          runDays: settings.runDays,
          weekStart: settings.weekStart as IsoWeekday,
          startWeeklyKm: demo.goal.startWeeklyKm,
          profile: demo.runs,
        }),
      },
    });
    const imported = await ingestPayload(scope, token.id, payload, Buffer.byteLength(payload));
    const runs = imported.status === "ok" ? imported.summary.imported : 0;
    // The same weekly job the cron runs, for the week that just closed.
    const adaptation = await ensureWeeklyAdaptation(scope);
    const proposals = adaptation?.status === "done" ? adaptation.proposals : 0;
    console.info(`Seeded ${demo.email} (goal: ${goal.name}, ${plan?.sessions.length ?? 0} sessions, ${runs} runs imported, ${proposals} pending adjustment(s))`);
  }
  console.info(`\nDemo password for all users: ${DEMO_PASSWORD}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
