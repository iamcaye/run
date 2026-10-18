/**
 * Seeds two demo users. Re-running replaces them (matched by email).
 *
 * Seeds accounts, settings, goals and plans (started a few weeks ago so there is history).
 * Activities (phase 4) and a pending adjustment (phase 6) are added as those features land.
 */
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import { closeDb, db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { addDays, todayInTz } from "@/lib/time";
import { forUser, type GoalInput, type SettingsPatch } from "@/server/dal";
import { createPlanIfMissing } from "@/services/plans";

export const DEMO_PASSWORD = "demo-password-123";

type DemoUser = {
  name: string;
  email: string;
  settings: SettingsPatch;
  goal: GoalInput;
  /** The plan started this many days ago. */
  planStartedDaysAgo: number;
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
      raceDate: "2027-03-07",
      distanceKm: 21.0975,
      goalType: "target_time",
      targetTimeSeconds: 6300, // 1:45:00
      startWeeklyKm: 30,
      level: "intermediate",
      notes: null,
    },
    planStartedDaysAgo: 22,
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
    console.info(`Seeded ${demo.email} (goal: ${goal.name}, ${plan?.sessions.length ?? 0} sessions)`);
  }
  console.info(`\nDemo password for all users: ${DEMO_PASSWORD}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
