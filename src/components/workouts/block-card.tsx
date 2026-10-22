import {
  distanceBounds,
  formatDistanceInput,
  fromDisplay,
  parseDistance,
  parseTime,
  REPS_BOUNDS,
  switchTarget,
  timeBounds,
  toDisplay,
  toggleMeasure,
  toggleRecoveryMeasure,
  type Amount,
  type BlockDisplay,
  type BlockKind,
  type Measure,
} from "@/lib/custom-plans/editor-model";
import type { RecoveryKind, StructureStep } from "@/lib/planning/types";
import { formatDuration, type Units } from "@/lib/units";
import { Segmented } from "./segmented";
import { Stepper } from "./stepper";
import { TargetPicker } from "./target-picker";

export const BLOCK_LABELS: Readonly<Record<BlockKind, string>> = {
  warmup: "Warm-up",
  steady: "Run",
  cooldown: "Cool-down",
  reps: "Repeat",
};

const PLAIN_KINDS = (["warmup", "steady", "cooldown"] as const).map((k) => ({ value: k, label: BLOCK_LABELS[k] }));

const MEASURES: readonly { value: Measure; label: string }[] = [
  { value: "distance", label: "Distance" },
  { value: "time", label: "Time" },
];

const RECOVERY_KINDS: readonly { value: RecoveryKind; label: string }[] = [
  { value: "jog", label: "Jog" },
  { value: "walk", label: "Walk" },
  { value: "stand", label: "Stand" },
];

const iconButton =
  "grid size-8 place-items-center rounded-lg text-base text-muted hover:bg-track disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent";

function AmountStepper({
  label,
  amount,
  kind,
  units,
  onChange,
}: {
  label: string;
  amount: Amount;
  kind: BlockKind | "recovery";
  units: Units;
  onChange: (value: number) => void;
}) {
  if (amount.measure === "distance") {
    return (
      <Stepper
        label={`${label} distance`}
        value={amount.value}
        bounds={distanceBounds(kind, units)}
        format={formatDistanceInput}
        parse={(s) => parseDistance(s, units)}
        onChange={onChange}
        suffix={units}
      />
    );
  }
  return (
    <Stepper
      label={`${label} time`}
      value={amount.value}
      bounds={timeBounds(kind)}
      format={formatDuration}
      // A bare number means minutes for whole blocks, seconds for reps and recoveries.
      parse={(s) => parseTime(s, kind === "reps" || kind === "recovery" ? "s" : "min")}
      onChange={onChange}
      suffix={kind === "reps" || kind === "recovery" ? "m:ss" : "min"}
      inputMode="text"
    />
  );
}

/** One editable block: kind, size (distance or time), target and, for repeats, reps + recovery. */
export function BlockCard({
  step,
  index,
  count,
  units,
  onChange,
  onMove,
  onDelete,
}: {
  step: StructureStep;
  index: number;
  count: number;
  units: Units;
  onChange: (step: StructureStep) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const d = toDisplay(step, units);
  const update = (next: BlockDisplay) => onChange(fromDisplay(next, units));
  const title = d.kind === "reps" ? `Repeat ${d.reps}×` : BLOCK_LABELS[d.kind];
  const sizeLabel = d.kind === "reps" ? "Rep" : BLOCK_LABELS[d.kind];

  return (
    <section
      aria-label={`Block ${index + 1}: ${title}`}
      className={`flex flex-col gap-3 rounded-2xl bg-surface p-3 ${d.kind === "reps" ? "border-l-4 border-accent" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        {d.kind === "reps" ? (
          <h3 className="font-condensed text-lg font-extrabold uppercase italic">Repeat</h3>
        ) : (
          <select
            aria-label={`Block ${index + 1} type`}
            value={d.kind}
            onChange={(e) => update({ ...d, kind: e.target.value as typeof d.kind })}
            className="-ml-1 rounded-lg bg-transparent px-1 py-0.5 font-condensed text-lg font-extrabold uppercase italic outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {PLAIN_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            data-move={`up-${index}`}
            className={iconButton}
            aria-label={`Move ${title} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            data-move={`down-${index}`}
            className={iconButton}
            aria-label={`Move ${title} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button type="button" className={iconButton} aria-label={`Delete ${title}`} disabled={count <= 1} onClick={onDelete}>
            ✕
          </button>
        </div>
      </div>

      {d.kind === "reps" ? (
        <Stepper
          label="Repetitions"
          value={d.reps}
          bounds={REPS_BOUNDS}
          format={(v) => `${v}×`}
          parse={(s) => (/^\d+\s*[x×]?$/i.test(s.trim()) ? Number.parseInt(s, 10) : null)}
          onChange={(reps) => update({ ...d, reps })}
          inputMode="numeric"
        />
      ) : null}

      <Segmented
        label={`${sizeLabel} measure`}
        hideLabel
        options={MEASURES}
        value={d.amount.measure}
        onChange={(m) => m !== d.amount.measure && update(toggleMeasure(d, units))}
      />
      <AmountStepper
        label={sizeLabel}
        amount={d.amount}
        kind={d.kind}
        units={units}
        onChange={(value) => update({ ...d, amount: { ...d.amount, value } })}
      />

      <TargetPicker
        target={d.target}
        units={units}
        onKindChange={(kind) => update(switchTarget(d, kind, units))}
        onChange={(target) => update({ ...d, target })}
      />

      {d.kind === "reps" ? (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <Segmented
            label="Recovery"
            options={MEASURES}
            value={d.recovery.measure}
            onChange={(m) => m !== d.recovery.measure && update(toggleRecoveryMeasure(d, units))}
          />
          <AmountStepper
            label="Recovery"
            amount={d.recovery}
            kind="recovery"
            units={units}
            onChange={(value) => update({ ...d, recovery: { ...d.recovery, value } })}
          />
          <Segmented
            label="Recovery type"
            hideLabel
            options={RECOVERY_KINDS}
            value={d.recoveryKind}
            onChange={(recoveryKind) => update({ ...d, recoveryKind })}
          />
        </div>
      ) : null}
    </section>
  );
}
