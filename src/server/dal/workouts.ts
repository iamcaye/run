import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { workout } from "@/server/db/schema";
import type { Workout, WorkoutInput, WorkoutPatch } from "./types";

export function workoutsRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(workout.id, id), eq(workout.userId, userId));

  return {
    /** Most recently edited first. */
    list(): Promise<Workout[]> {
      return d.select().from(workout).where(eq(workout.userId, userId)).orderBy(desc(workout.updatedAt));
    },

    async get(id: string): Promise<Workout | null> {
      const [row] = await d.select().from(workout).where(owned(id));
      return row ?? null;
    },

    async create(input: WorkoutInput): Promise<Workout> {
      const { name, type, notes, steps } = input;
      const [row] = await d.insert(workout).values({ name, type, notes, steps, userId }).returning();
      if (!row) throw new Error("Failed to create workout");
      return row;
    },

    async update(id: string, patch: WorkoutPatch): Promise<Workout | null> {
      const { name, type, notes, steps } = patch;
      const [row] = await d.update(workout).set({ name, type, notes, steps }).where(owned(id)).returning();
      return row ?? null;
    },

    async delete(id: string): Promise<boolean> {
      const rows = await d.delete(workout).where(owned(id)).returning({ id: workout.id });
      return rows.length > 0;
    },
  };
}
