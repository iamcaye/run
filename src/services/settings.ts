import "server-only";
import { availabilityChanged } from "@/lib/goals/rules";
import type { AvailabilityInput, PreferencesInput } from "@/lib/validation/settings";
import type { Settings, UserScope } from "@/server/dal";

/** Returns whether the change should offer to regenerate the active goal's future sessions. */
export async function updateAvailability(
  scope: UserScope,
  input: AvailabilityInput,
): Promise<{ settings: Settings; planAffected: boolean }> {
  const before = await scope.settings.get();
  const settings = await scope.settings.update(input);
  return { settings, planAffected: availabilityChanged(before, settings) };
}

/** weekStart shifts the week grid, so it counts as a plan-affecting change too. */
export async function updatePreferences(
  scope: UserScope,
  input: PreferencesInput,
): Promise<{ settings: Settings; planAffected: boolean }> {
  const before = await scope.settings.get();
  const settings = await scope.settings.update(input);
  return { settings, planAffected: before.weekStart !== settings.weekStart };
}

export async function completeOnboarding(scope: UserScope): Promise<void> {
  const settings = await scope.settings.get();
  if (!settings.onboardingCompletedAt) {
    await scope.settings.update({ onboardingCompletedAt: new Date() });
  }
}
