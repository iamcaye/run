import { z } from "zod";
import { DISTANCE_PRESETS_KM, DISTANCE_KEYS, LEVELS } from "@/config/training";
import { isLocalDate, type LocalDate } from "@/lib/time";
import { fromDisplayDistance, parseDuration, type Units } from "@/lib/units";

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export type GoalFormContext = {
  /** Today in the user's timezone. */
  today: LocalDate;
  /** Units the distance/volume fields were entered in. */
  units: Units;
  /** New goals must be in the future; past goals may be edited (e.g. notes). */
  requireFutureDate: boolean;
};

/** Parses the goal form (strings in display units) into canonical metric values. */
export function goalFormSchema({ today, units, requireFutureDate }: GoalFormContext) {
  return z
    .object({
      name: z.string().trim().min(1, "Give your goal a name").max(100),
      raceDate: z.string().refine(isLocalDate, "Pick a valid date"),
      distancePreset: z.enum([...DISTANCE_KEYS, "custom"]),
      customDistance: z.preprocess(emptyToUndefined, z.coerce.number().positive().max(250).optional()),
      goalType: z.enum(["finish", "target_time"]),
      targetTime: z.preprocess(emptyToUndefined, z.string().optional()),
      startWeeklyDistance: z.coerce.number().min(0, "Can't be negative").max(300),
      level: z.enum(LEVELS),
      notes: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
    })
    .superRefine((v, ctx) => {
      if (requireFutureDate && isLocalDate(v.raceDate) && v.raceDate <= today) {
        ctx.addIssue({ code: "custom", path: ["raceDate"], message: "Race date must be after today" });
      }
      if (v.distancePreset === "custom" && v.customDistance === undefined) {
        ctx.addIssue({ code: "custom", path: ["customDistance"], message: "Enter the race distance" });
      }
      if (v.goalType === "target_time") {
        const seconds = v.targetTime ? parseDuration(v.targetTime) : null;
        if (!seconds) {
          ctx.addIssue({
            code: "custom",
            path: ["targetTime"],
            message: "Enter a target time like 1:45:00 or 48:30",
          });
        }
      }
    })
    .transform((v) => ({
      name: v.name,
      raceDate: v.raceDate,
      distanceKm:
        v.distancePreset === "custom"
          ? round(fromDisplayDistance(v.customDistance ?? 0, units), 3)
          : DISTANCE_PRESETS_KM[v.distancePreset],
      goalType: v.goalType,
      targetTimeSeconds:
        v.goalType === "target_time" && v.targetTime ? parseDuration(v.targetTime) : null,
      startWeeklyKm: round(fromDisplayDistance(v.startWeeklyDistance, units), 1),
      level: v.level,
      notes: v.notes ?? null,
    }));
}

export type GoalFormValues = z.output<ReturnType<typeof goalFormSchema>>;

/** Which preset (if any) a stored distance corresponds to, for pre-filling the form. */
export function presetForDistance(distanceKm: number): (typeof DISTANCE_KEYS)[number] | "custom" {
  return DISTANCE_KEYS.find((k) => Math.abs(DISTANCE_PRESETS_KM[k] - distanceKm) < 0.001) ?? "custom";
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
