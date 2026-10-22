import { z } from "zod";
import type { DaySlot } from "./types";

/** What the builder puts in a drag: a My workouts entry or a filled day of the plan. */
export type DragPayload = { kind: "library"; id: string } | { kind: "slot"; slot: DaySlot };

const payloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("library"), id: z.string() }),
  z.object({
    kind: z.literal("slot"),
    slot: z.object({ week: z.number().int().min(0), day: z.number().int().min(1).max(7) }),
  }),
]);

/**
 * Reads a drop's data. Anything malformed, from another tab, or no longer valid for this plan
 * (a week past its end, a deleted library workout) is null, so the drop is ignored.
 */
export function parseDragPayload(
  raw: string,
  ctx: { weekCount: number; libraryIds: ReadonlySet<string> },
): DragPayload | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  const p = parsed.data;
  if (p.kind === "library") return ctx.libraryIds.has(p.id) ? p : null;
  if (p.slot.week >= ctx.weekCount) return null;
  return { kind: "slot", slot: { week: p.slot.week, day: p.slot.day as DaySlot["day"] } };
}
