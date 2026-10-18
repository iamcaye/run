import { z } from "zod";
import { isLocalDate, type LocalDate } from "@/lib/time";
import { fromDisplayDistance, parseDuration, type Units } from "@/lib/units";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export const rpeSchema = z.coerce.number().int().min(1, "Pick 1–10").max(10, "Pick 1–10");
export const notesSchema = z.preprocess(emptyToNull, z.string().trim().max(1000).nullable());

export const rpeNotesSchema = z.object({
  rpe: z.preprocess(emptyToNull, rpeSchema.nullable()),
  notes: notesSchema,
});

/** Sane running paces: 2:00–20:00 per km. */
const PACE_RANGE = [120, 1200] as const;

/** Manual run form (display units in, metric out). */
export function manualRunSchema({ today, units }: { today: LocalDate; units: Units }) {
  return z
    .object({
      date: z.string().refine(isLocalDate, "Pick a valid date").refine((d) => d <= today, "That date is in the future"),
      time: z.preprocess(emptyToNull, z.string().regex(/^\d{2}:\d{2}$/).nullable()),
      distance: z.coerce.number().positive("Enter the distance").max(200),
      duration: z.string().trim().min(1, "Enter how long it took"),
      rpe: rpeSchema,
      notes: notesSchema,
    })
    .transform((v, ctx) => {
      const seconds = parseDuration(v.duration);
      if (!seconds) {
        ctx.addIssue({ code: "custom", path: ["duration"], message: "Use mm:ss or h:mm:ss" });
        return z.NEVER;
      }
      const km = Math.round(fromDisplayDistance(v.distance, units) * 1000) / 1000;
      const pace = seconds / km;
      if (pace < PACE_RANGE[0] || pace > PACE_RANGE[1]) {
        ctx.addIssue({ code: "custom", path: ["duration"], message: "That pace looks off — check distance and time" });
        return z.NEVER;
      }
      return { date: v.date, time: v.time ?? "12:00", km, seconds, rpe: v.rpe, notes: v.notes };
    });
}

export type ManualRun = z.output<ReturnType<typeof manualRunSchema>>;
