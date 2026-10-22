import { describeStep } from "@/lib/planning/describe";
import { structureSegments } from "@/lib/planning/segments";
import type { StructureStep } from "@/lib/planning/types";
import type { Units } from "@/lib/units";

/** Proportional blocks of a session's steps; nothing for single-block sessions. */
export function StructureBar({ steps, units, size = "md" }: { steps: readonly StructureStep[]; units: Units; size?: "sm" | "md" }) {
  const segments = structureSegments(steps);
  if (segments.length < 2) return null;
  // sm lives in narrow day cards, so it packs tighter: many reps must still fit the width.
  const [tall, low, box, gap, minW] =
    size === "md" ? ["h-9", "h-3", "h-9", "gap-[3px]", "min-w-[3px]"] : ["h-6", "h-2", "h-6", "gap-px", "min-w-px"];
  return (
    <div
      role="img"
      aria-label={`Session structure: ${steps.map((s) => describeStep(s, units)).join("; ")}`}
      className={`flex w-full items-end overflow-hidden ${gap} ${box}`}
    >
      {segments.map((s, i) => (
        <div
          key={i}
          className={`${minW} rounded-sm ${s.work ? `${tall} bg-accent` : `${low} bg-track`}`}
          style={{ flexGrow: s.weight, flexBasis: 0 }}
        />
      ))}
    </div>
  );
}
