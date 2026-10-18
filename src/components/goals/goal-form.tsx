"use client";

import { useState } from "react";
import { PlanImpactNotice } from "@/components/goals/plan-impact-notice";
import {
  Checkbox,
  Field,
  FormError,
  FormSuccess,
  Select,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import type { FormState } from "@/server/actions/form-state";

export type GoalFormDefaults = {
  name: string;
  raceDate: string;
  distancePreset: "5k" | "10k" | "half" | "marathon" | "custom";
  /** In display units. */
  customDistance: string;
  goalType: "finish" | "target_time";
  targetTime: string;
  /** In display units. */
  startWeeklyDistance: string;
  level: "beginner" | "intermediate" | "advanced";
  notes: string;
};

export const emptyGoalDefaults: GoalFormDefaults = {
  name: "",
  raceDate: "",
  distancePreset: "half",
  customDistance: "",
  goalType: "finish",
  targetTime: "",
  startWeeklyDistance: "",
  level: "beginner",
  notes: "",
};

const presetOptions = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half", label: "Half marathon" },
  { value: "marathon", label: "Marathon" },
  { value: "custom", label: "Custom distance" },
] as const;

const goalTypeOptions = [
  { value: "finish", label: "Finish comfortably" },
  { value: "target_time", label: "Hit a target time" },
] as const;

const levelOptions = [
  { value: "beginner", label: "Beginner — new to structured training" },
  { value: "intermediate", label: "Intermediate — trained for races before" },
  { value: "advanced", label: "Advanced — high volume, regular quality work" },
] as const;

export function GoalForm({
  action,
  defaults,
  units,
  minDate,
  submitLabel,
  redirectTo,
  showMakeActive = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: GoalFormDefaults;
  units: "km" | "mi";
  /** Earliest selectable race date (create only). */
  minDate?: string;
  submitLabel: string;
  redirectTo?: string;
  showMakeActive?: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const [preset, setPreset] = useState(defaults.distancePreset);
  const [goalType, setGoalType] = useState(defaults.goalType);
  const errors = state.fieldErrors;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
      <Field label="Goal name" name="name" defaultValue={defaults.name} placeholder="Valencia Half" required error={errors?.name} />
      <Field label="Race date" name="raceDate" type="date" min={minDate} defaultValue={defaults.raceDate} required error={errors?.raceDate} />
      <Select
        label="Distance"
        name="distancePreset"
        value={preset}
        onChange={(e) => setPreset(e.target.value as GoalFormDefaults["distancePreset"])}
        options={presetOptions}
        error={errors?.distancePreset}
      />
      {preset === "custom" ? (
        <Field
          label={`Race distance (${units})`}
          name="customDistance"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.1"
          defaultValue={defaults.customDistance}
          required
          error={errors?.customDistance}
        />
      ) : null}
      <Select
        label="Goal"
        name="goalType"
        value={goalType}
        onChange={(e) => setGoalType(e.target.value as GoalFormDefaults["goalType"])}
        options={goalTypeOptions}
        error={errors?.goalType}
      />
      {goalType === "target_time" ? (
        <Field
          label="Target time"
          name="targetTime"
          placeholder="1:45:00"
          inputMode="numeric"
          defaultValue={defaults.targetTime}
          hint="h:mm:ss or mm:ss"
          required
          error={errors?.targetTime}
        />
      ) : null}
      <Field
        label={`Current weekly volume (${units})`}
        name="startWeeklyDistance"
        type="number"
        inputMode="decimal"
        step="0.5"
        min="0"
        defaultValue={defaults.startWeeklyDistance}
        hint="Roughly what you've averaged over the last few weeks."
        required
        error={errors?.startWeeklyDistance}
      />
      <Select label="Experience" name="level" defaultValue={defaults.level} options={levelOptions} error={errors?.level} />
      <Textarea label="Notes" name="notes" defaultValue={defaults.notes} error={errors?.notes} />
      {showMakeActive ? <Checkbox label="Make this my active goal" name="makeActive" /> : null}
      <FormError>{state.status === "error" ? state.message : null}</FormError>
      <FormSuccess>{state.status === "success" ? state.message : null}</FormSuccess>
      {state.status === "success" && state.planAffected ? <PlanImpactNotice /> : null}
      <SubmitButton pending={pending} pendingLabel="Saving…" className="self-start">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
