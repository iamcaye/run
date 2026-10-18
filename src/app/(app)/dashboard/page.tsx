import { requireUser } from "@/server/auth/session";
import { forUser } from "@/server/dal";

// Phase 1 placeholder — the real dashboard lands in phase 5.
export default async function DashboardPage() {
  const user = await requireUser();
  const scope = forUser(user.id);
  const [settings, active] = await Promise.all([scope.settings.get(), scope.goals.getActive()]);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-muted">
        Timezone {settings.timezone} · units {settings.units}
      </p>
      <p>{active ? `Active goal: ${active.name} on ${active.raceDate}` : "No active goal yet."}</p>
    </div>
  );
}
