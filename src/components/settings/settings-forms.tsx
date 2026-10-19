"use client";

import { useEffect, useState } from "react";
import { PlanImpactNotice } from "@/components/goals/plan-impact-notice";
import {
  ChipGroup,
  Field,
  FormError,
  FormSuccess,
  Select,
  SubmitButton,
} from "@/components/ui/form";
import { listTimeZones } from "@/lib/time";
import { useFormAction } from "@/components/ui/use-form-action";
import type { FormState } from "@/server/actions/form-state";
import {
  updateAvailabilityAction,
  updateHeartRateAction,
  updatePreferencesAction,
  updateProfileAction,
} from "@/server/actions/settings";
import { maxRunsOptions, unitOptions, weekdayChipOptions, weekdayOptions } from "./options";

function Status({ state }: { state: FormState }) {
  return (
    <>
      <FormError>{state.status === "error" ? state.message : null}</FormError>
      <FormSuccess>{state.status === "success" ? state.message : null}</FormSuccess>
      {state.status === "success" && state.planAffected ? <PlanImpactNotice /> : null}
    </>
  );
}

export function ProfileForm({ name }: { name: string }) {
  const { state, onSubmit, pending } = useFormAction(updateProfileAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Display name" name="name" defaultValue={name} required error={state.fieldErrors?.name} />
      <Status state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…" variant="ink" className="self-start">
        Save
      </SubmitButton>
    </form>
  );
}

/** Time zone, units and week start. Also rendered inside the onboarding settings step. */
export function PreferencesFields({
  timezone,
  units,
  weekStart,
  detectTimezone = false,
  errors,
}: {
  timezone: string;
  units: string;
  weekStart: number;
  detectTimezone?: boolean;
  errors?: FormState["fieldErrors"];
}) {
  const [zones] = useState(listTimeZones);
  const [tz, setTz] = useState(timezone);
  useEffect(() => {
    if (!detectTimezone) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Sync with the browser's zone once on mount (external system → state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detected && zones.includes(detected)) setTz(detected);
  }, [detectTimezone, zones]);

  const tzOptions = (zones.includes(tz) ? zones : [tz, ...zones]).map((z) => ({ value: z, label: z.replaceAll("_", " ") }));

  return (
    <>
      <Select
        label="Time zone"
        name="timezone"
        value={tz}
        onChange={(e) => setTz(e.target.value)}
        options={tzOptions}
        error={errors?.timezone}
        hint="Days and weeks are calculated in this zone."
      />
      <Select label="Units" name="units" defaultValue={units} options={unitOptions} error={errors?.units} />
      <Select
        label="Week starts on"
        name="weekStart"
        defaultValue={String(weekStart)}
        options={weekdayOptions}
        error={errors?.weekStart}
      />
    </>
  );
}

export function PreferencesForm(props: { timezone: string; units: string; weekStart: number }) {
  const { state, onSubmit, pending } = useFormAction(updatePreferencesAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <PreferencesFields {...props} errors={state.fieldErrors} />
      <Status state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…" variant="ink" className="self-start">
        Save
      </SubmitButton>
    </form>
  );
}

export function AvailabilityFields({
  runDays,
  longRunDay,
  maxRunsPerWeek,
  errors,
}: {
  runDays: readonly number[];
  longRunDay: number;
  maxRunsPerWeek: number;
  errors?: FormState["fieldErrors"];
}) {
  return (
    <>
      <ChipGroup
        label="Days you can run"
        name="runDays"
        options={weekdayChipOptions}
        defaultValues={runDays.map(String)}
        error={errors?.runDays}
      />
      <Select
        label="Long run day"
        name="longRunDay"
        defaultValue={String(longRunDay)}
        options={weekdayOptions}
        error={errors?.longRunDay}
      />
      <Select
        label="Max runs per week"
        name="maxRunsPerWeek"
        defaultValue={String(maxRunsPerWeek)}
        options={maxRunsOptions}
        error={errors?.maxRunsPerWeek}
      />
    </>
  );
}

export function AvailabilityForm(props: { runDays: readonly number[]; longRunDay: number; maxRunsPerWeek: number }) {
  const { state, onSubmit, pending } = useFormAction(updateAvailabilityAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <AvailabilityFields {...props} errors={state.fieldErrors} />
      <Status state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…" variant="ink" className="self-start">
        Save
      </SubmitButton>
    </form>
  );
}

export function HeartRateForm({ maxHr, restHr }: { maxHr: number | null; restHr: number | null }) {
  const { state, onSubmit, pending } = useFormAction(updateHeartRateAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Optional. With both values we show heart-rate zones (Karvonen); without them, effort is based on RPE.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Max HR"
          name="maxHr"
          type="number"
          inputMode="numeric"
          min={30}
          max={240}
          defaultValue={maxHr ?? ""}
          error={state.fieldErrors?.maxHr}
        />
        <Field
          label="Resting HR"
          name="restHr"
          type="number"
          inputMode="numeric"
          min={30}
          max={240}
          defaultValue={restHr ?? ""}
          error={state.fieldErrors?.restHr}
        />
      </div>
      <Status state={state} />
      <SubmitButton pending={pending} pendingLabel="Saving…" variant="ink" className="self-start">
        Save
      </SubmitButton>
    </form>
  );
}
