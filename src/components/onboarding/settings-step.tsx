"use client";

import { AvailabilityFields, PreferencesFields } from "@/components/settings/settings-forms";
import { FormError, SubmitButton } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { saveOnboardingSettingsAction } from "@/server/actions/onboarding";
import type { Settings } from "@/server/dal";

export function SettingsStep({ settings, plan }: { settings: Settings; plan?: string }) {
  const { state, onSubmit, pending } = useFormAction(saveOnboardingSettingsAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {plan ? <input type="hidden" name="plan" value={plan} /> : null}
      <PreferencesFields
        timezone={settings.timezone}
        units={settings.units}
        weekStart={settings.weekStart}
        detectTimezone={!settings.onboardingCompletedAt}
        errors={state.fieldErrors}
      />
      <AvailabilityFields
        runDays={settings.runDays}
        longRunDay={settings.longRunDay}
        maxRunsPerWeek={settings.maxRunsPerWeek}
        errors={state.fieldErrors}
      />
      <FormError>{state.status === "error" ? state.message : null}</FormError>
      <SubmitButton pending={pending} pendingLabel="Saving…" className="self-start">
        Continue
      </SubmitButton>
    </form>
  );
}
