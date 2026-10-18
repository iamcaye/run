import { z } from "zod";
import { isValidTimeZone, type IsoWeekday } from "@/lib/time";

const weekday = z.coerce
  .number()
  .int()
  .min(1)
  .max(7)
  .transform((n) => n as IsoWeekday);

/** Empty form inputs mean "not set". */
const optionalHr = (label: string) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.coerce.number().int().min(30, `${label} looks too low`).max(240, `${label} looks too high`).nullable(),
  );

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
});

export const preferencesSchema = z.object({
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  units: z.enum(["km", "mi"]),
  weekStart: weekday,
});

export const availabilitySchema = z
  .object({
    runDays: z
      .array(weekday)
      .min(1, "Pick at least one run day")
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    longRunDay: weekday,
    maxRunsPerWeek: z.coerce.number().int().min(1).max(7),
  })
  .superRefine((v, ctx) => {
    if (!v.runDays.includes(v.longRunDay)) {
      ctx.addIssue({ code: "custom", path: ["longRunDay"], message: "Long run day must be one of your run days" });
    }
    if (v.maxRunsPerWeek > v.runDays.length) {
      ctx.addIssue({
        code: "custom",
        path: ["maxRunsPerWeek"],
        message: `You picked ${v.runDays.length} run day(s); max runs can't exceed that`,
      });
    }
  });

export const heartRateSchema = z
  .object({ maxHr: optionalHr("Max HR"), restHr: optionalHr("Resting HR") })
  .superRefine((v, ctx) => {
    if ((v.maxHr === null) !== (v.restHr === null)) {
      ctx.addIssue({ code: "custom", path: ["restHr"], message: "Set both max and resting HR, or neither" });
    }
    if (v.maxHr !== null && v.restHr !== null && v.restHr >= v.maxHr) {
      ctx.addIssue({ code: "custom", path: ["restHr"], message: "Resting HR must be below max HR" });
    }
  });

export type ProfileInput = z.infer<typeof profileSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type HeartRateInput = z.infer<typeof heartRateSchema>;
