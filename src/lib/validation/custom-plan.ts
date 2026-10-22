import { z } from "zod";
import { SESSION_TYPES, WORKOUT_LIMITS as L } from "@/config/training";
import type { CustomPlanDoc, PlanWorkout, WorkoutType } from "@/lib/custom-plans/types";
import type { StructureStep } from "@/lib/planning/types";

const km = z.number().positive().max(L.maxKm);
const seconds = z.number().positive().max(L.maxSeconds);

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pace"), secPerKm: z.number().min(L.minPaceSecPerKm).max(L.maxPaceSecPerKm) }),
  z.object({
    kind: z.literal("hr_zone"),
    zone: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  }),
  z.object({ kind: z.literal("rpe"), rpe: z.number().int().min(1).max(10) }),
]);

const paceZone = z.enum(["easy", "long", "tempo", "intervals", "race_pace"]);
const pace = z.number().min(L.minPaceSecPerKm).max(L.maxPaceSecPerKm);
const exactlyOne = (a: unknown, b: unknown) => (a === undefined) !== (b === undefined);

const timedBlock = <K extends "warmup" | "cooldown">(kind: K) =>
  z
    .object({ kind: z.literal(kind), km: km.optional(), seconds: seconds.optional(), target: targetSchema.optional() })
    .refine((s) => exactlyOne(s.km, s.seconds), { message: "Set exactly one of km or seconds" });

export const stepSchema = z.discriminatedUnion("kind", [
  timedBlock("warmup"),
  timedBlock("cooldown"),
  z
    .object({
      kind: z.literal("reps"),
      reps: z.number().int().min(1).max(L.maxReps),
      repKm: km.optional(),
      repSeconds: seconds.optional(),
      zone: paceZone.optional(),
      paceSecPerKm: pace.optional(),
      effort: z.string().max(L.notesMax).optional(),
      target: targetSchema.optional(),
      recoverySeconds: seconds.optional(),
      recoveryKm: km.optional(),
      recoveryKind: z.enum(["jog", "walk", "stand"]).optional(),
    })
    .refine((s) => exactlyOne(s.repKm, s.repSeconds), { message: "Set exactly one of repKm or repSeconds" })
    .refine((s) => exactlyOne(s.recoverySeconds, s.recoveryKm), {
      message: "Set exactly one of recoverySeconds or recoveryKm",
    }),
  z
    .object({
      kind: z.literal("steady"),
      km: km.optional(),
      seconds: seconds.optional(),
      zone: paceZone.optional(),
      paceSecPerKm: pace.optional(),
      effort: z.string().max(L.notesMax).optional(),
      target: targetSchema.optional(),
    })
    .refine((s) => exactlyOne(s.km, s.seconds), { message: "Set exactly one of km or seconds" }),
]) satisfies z.ZodType<StructureStep>;

const workoutTypes = SESSION_TYPES.filter((t): t is WorkoutType => t !== "rest");

export const planWorkoutSchema = z.object({
  name: z.string().trim().min(1).max(L.nameMax),
  type: z.enum(workoutTypes as [WorkoutType, ...WorkoutType[]]),
  notes: z.string().max(L.notesMax).nullable(),
  steps: z.array(stepSchema).min(1).max(L.maxSteps),
}) satisfies z.ZodType<PlanWorkout>;

export const customPlanDocSchema = z.object({
  weeks: z
    .array(
      z.object({
        id: z.string().min(1).max(L.weekIdMax),
        days: z.array(planWorkoutSchema.nullable()).length(7),
      }),
    )
    .max(L.maxWeeks)
    .superRefine((weeks, ctx) => {
      // Plan sessions are keyed by `${weekId}:${day}`: a repeated id would make two weeks collide.
      const seen = new Set<string>();
      weeks.forEach((w, i) => {
        if (seen.has(w.id)) ctx.addIssue({ code: "custom", message: "Duplicate week id", path: [i, "id"] });
        seen.add(w.id);
      });
    }),
}) satisfies z.ZodType<CustomPlanDoc>;

export const planMetaSchema = z.object({
  name: z.string().trim().min(1).max(L.nameMax),
  description: z.string().max(L.notesMax).nullable(),
});
