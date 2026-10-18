import { z } from "zod";

/**
 * Envelope of a Health Auto Export "REST API" automation payload. Deliberately loose: unknown
 * fields pass through and each workout is mapped individually by `mapWorkout`, so one odd
 * workout (or a new export version) never sinks the whole import.
 */
export const HaePayloadSchema = z.looseObject({
  data: z.looseObject({
    workouts: z.array(z.looseObject({})).default([]),
  }),
});

export type HaePayload = z.infer<typeof HaePayloadSchema>;

/** Fields we read from a workout. All optional — names vary between export versions. */
export const HaeWorkoutSchema = z.looseObject({
  id: z.string().optional(),
  uuid: z.string().optional(),
  name: z.string().optional(),
  workoutActivityType: z.string().optional(),
  start: z.union([z.string(), z.number()]).optional(),
  startDate: z.union([z.string(), z.number()]).optional(),
  end: z.union([z.string(), z.number()]).optional(),
  endDate: z.union([z.string(), z.number()]).optional(),
  duration: z.unknown().optional(),
  distance: z.unknown().optional(),
  totalDistance: z.unknown().optional(),
  avgHeartRate: z.unknown().optional(),
  maxHeartRate: z.unknown().optional(),
  heartRate: z.unknown().optional(),
  heartRateData: z.array(z.looseObject({})).optional(),
  route: z.array(z.looseObject({})).optional(),
});
