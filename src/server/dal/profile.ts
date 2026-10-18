import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { user } from "@/server/db/schema";

export function profileRepo(d: Db, userId: string) {
  return {
    async get(): Promise<{ name: string; email: string } | null> {
      const [row] = await d
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, userId));
      return row ?? null;
    },

    async updateName(name: string): Promise<void> {
      await d.update(user).set({ name }).where(eq(user.id, userId));
    },
  };
}
