import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { userSettings } from "@/server/db/schema";
import type { Settings, SettingsPatch } from "./types";

export function settingsRepo(d: Db, userId: string) {
  const where = eq(userSettings.userId, userId);

  return {
    async get(): Promise<Settings> {
      const [existing] = await d.select().from(userSettings).where(where);
      if (existing) return existing;
      // Normally created on sign-up; this covers users created any other way.
      await d.insert(userSettings).values({ userId }).onConflictDoNothing();
      const [created] = await d.select().from(userSettings).where(where);
      if (!created) throw new Error("Failed to load settings");
      return created;
    },

    async update(patch: SettingsPatch): Promise<Settings> {
      const [row] = await d
        .insert(userSettings)
        .values({ ...patch, userId })
        .onConflictDoUpdate({ target: userSettings.userId, set: patch })
        .returning();
      if (!row) throw new Error("Failed to update settings");
      return row;
    },
  };
}
