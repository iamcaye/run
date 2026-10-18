import { describe, expect, it } from "vitest";
import { manualRunSchema, rpeNotesSchema } from "./activity";

const ctx = { today: "2026-10-18", units: "km" as const };

describe("manual run form", () => {
  it("parses into metric values with a default time", () => {
    expect(manualRunSchema(ctx).parse({ date: "2026-10-18", time: "", distance: "10", duration: "52:30", rpe: "6", notes: "" })).toEqual({
      date: "2026-10-18",
      time: "12:00",
      km: 10,
      seconds: 3150,
      rpe: 6,
      notes: null,
    });
  });

  it("converts miles", () => {
    const r = manualRunSchema({ ...ctx, units: "mi" }).parse({ date: "2026-10-18", time: "07:15", distance: "5", duration: "45:00", rpe: "4", notes: "" });
    expect(r.km).toBeCloseTo(8.047, 3);
    expect(r.time).toBe("07:15");
  });

  it("rejects future dates, bad durations, impossible paces and missing RPE", () => {
    const bad = (o: Record<string, string>) =>
      manualRunSchema(ctx).safeParse({ date: "2026-10-18", time: "", distance: "10", duration: "50:00", rpe: "5", notes: "", ...o });
    expect(bad({ date: "2026-10-19" }).error?.issues[0]?.path).toEqual(["date"]);
    expect(bad({ duration: "fast" }).error?.issues[0]?.message).toMatch(/mm:ss/);
    expect(bad({ duration: "10:00" }).error?.issues[0]?.message).toMatch(/pace looks off/); // 1:00/km
    expect(bad({ rpe: "" }).success).toBe(false);
    expect(bad({ rpe: "11" }).success).toBe(false);
  });
});

describe("rpe + notes", () => {
  it("allows clearing both", () => {
    expect(rpeNotesSchema.parse({ rpe: "", notes: "" })).toEqual({ rpe: null, notes: null });
    expect(rpeNotesSchema.parse({ rpe: "7", notes: " windy " })).toEqual({ rpe: 7, notes: "windy" });
  });
});
