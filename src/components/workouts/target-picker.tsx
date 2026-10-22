import {
  formatPaceInput,
  paceBounds,
  parsePace,
  RPE_BOUNDS,
  stepPace,
  type DisplayTarget,
  type TargetKind,
} from "@/lib/custom-plans/editor-model";
import type { HrZone } from "@/lib/planning/types";
import type { Units } from "@/lib/units";
import { Segmented } from "./segmented";
import { Stepper } from "./stepper";

const KINDS: readonly { value: TargetKind; label: string }[] = [
  { value: "pace", label: "Pace" },
  { value: "hr_zone", label: "Zone" },
  { value: "rpe", label: "RPE" },
  { value: "none", label: "None" },
];

const ZONES: readonly { value: HrZone; label: string }[] = ([1, 2, 3, 4, 5] as const).map((z) => ({ value: z, label: `Z${z}` }));

/** Target kind (Pace · Zone · RPE · None) plus the control for its value. */
export function TargetPicker({
  target,
  units,
  onKindChange,
  onChange,
}: {
  target: DisplayTarget;
  units: Units;
  onKindChange: (kind: TargetKind) => void;
  onChange: (target: DisplayTarget) => void;
}) {
  return (
    <>
      <Segmented label="Target" options={KINDS} value={target.kind} onChange={onKindChange} />
      {target.kind === "pace" ? (
        <Stepper
          label="Pace"
          value={target.secPerUnit}
          bounds={paceBounds(units)}
          format={formatPaceInput}
          parse={(s) => parsePace(s, units)}
          stepFn={(v, dir) => stepPace(v, dir, units)}
          onChange={(secPerUnit) => onChange({ kind: "pace", secPerUnit })}
          suffix={`/${units}`}
          inputMode="text"
        />
      ) : null}
      {target.kind === "hr_zone" ? (
        <Segmented label="Heart-rate zone" options={ZONES} value={target.zone} onChange={(zone) => onChange({ kind: "hr_zone", zone })} />
      ) : null}
      {target.kind === "rpe" ? (
        <Stepper
          label="RPE"
          value={target.rpe}
          bounds={RPE_BOUNDS}
          format={String}
          parse={(s) => (/^\d+$/.test(s.trim()) ? Number(s) : null)}
          onChange={(rpe) => onChange({ kind: "rpe", rpe })}
          inputMode="numeric"
        />
      ) : null}
    </>
  );
}
