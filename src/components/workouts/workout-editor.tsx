"use client";

import { useRef } from "react";
import { StructureBar } from "@/components/plan/structure-bar";
import { Field, Select, Textarea } from "@/components/ui/form";
import { SESSION_TYPES, WORKOUT_LIMITS as L } from "@/config/training";
import { estimateLabel, newBlock, type BlockKind } from "@/lib/custom-plans/editor-model";
import type { PlanWorkout, WorkoutType } from "@/lib/custom-plans/types";
import { SESSION_LABELS } from "@/lib/planning/describe";
import type { StructureStep } from "@/lib/planning/types";
import type { Units } from "@/lib/units";
import { BlockCard } from "./block-card";

const typeOptions = SESSION_TYPES.filter((t): t is WorkoutType => t !== "rest").map((t) => ({ value: t, label: SESSION_LABELS[t] }));

const addButton =
  "flex-1 rounded-xl border-[1.5px] border-dashed border-border px-3 py-2.5 text-sm font-semibold text-muted hover:border-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent";

/**
 * Controlled block editor for one workout. Every emitted value passes `planWorkoutSchema`,
 * except an empty name while the user is typing it.
 */
export function WorkoutEditor({
  value,
  onChange,
  units,
}: {
  value: PlanWorkout;
  onChange: (next: PlanWorkout) => void;
  units: Units;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const { steps } = value;
  const setSteps = (next: StructureStep[]) => onChange({ ...value, steps: next });

  const add = (kind: BlockKind) => {
    // A new run block goes before a trailing cool-down; repeats too.
    const at = steps.at(-1)?.kind === "cooldown" ? steps.length - 1 : steps.length;
    setSteps([...steps.slice(0, at), newBlock(kind), ...steps.slice(at)]);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSteps(next);
    // Keep focus on the moved block's control so repeated presses keep moving it.
    const target = j === 0 ? `down-${j}` : j === steps.length - 1 ? `up-${j}` : `${dir < 0 ? "up" : "down"}-${j}`;
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-move="${target}"]`)?.focus());
  };

  const full = steps.length >= L.maxSteps;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field
          label="Name"
          value={value.name}
          maxLength={L.nameMax}
          placeholder="e.g. 6 × 1 km"
          required
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
        <Select
          label="Session type"
          value={value.type}
          options={typeOptions}
          onChange={(e) => onChange({ ...value, type: e.target.value as WorkoutType })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <StructureBar steps={steps} units={units} />
        <p className="text-sm text-muted tabular-nums" aria-live="polite">{estimateLabel(steps, units)}</p>
      </div>

      <ol ref={listRef} className="flex flex-col gap-2" aria-label="Blocks">
        {steps.map((step, i) => (
          <li key={i}>
            <BlockCard
              step={step}
              index={i}
              count={steps.length}
              units={units}
              onChange={(s) => setSteps(steps.map((x, k) => (k === i ? s : x)))}
              onMove={(dir) => move(i, dir)}
              onDelete={() => setSteps(steps.filter((_, k) => k !== i))}
            />
          </li>
        ))}
      </ol>

      <div className="flex gap-2">
        <button type="button" className={addButton} disabled={full} onClick={() => add("steady")}>
          + Block
        </button>
        <button type="button" className={addButton} disabled={full} onClick={() => add("reps")}>
          + Repeat
        </button>
      </div>

      <Textarea
        label="Notes"
        value={value.notes ?? ""}
        maxLength={L.notesMax}
        onChange={(e) => onChange({ ...value, notes: e.target.value === "" ? null : e.target.value })}
      />
    </div>
  );
}
