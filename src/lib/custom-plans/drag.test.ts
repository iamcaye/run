import { describe, expect, it } from "vitest";
import { parseDragPayload } from "./drag";

const ctx = { weekCount: 2, libraryIds: new Set(["lib-1"]) };
const parse = (v: unknown) => parseDragPayload(typeof v === "string" ? v : JSON.stringify(v), ctx);

describe("parseDragPayload", () => {
  it("accepts a slot inside the plan and a known library workout", () => {
    expect(parse({ kind: "slot", slot: { week: 1, day: 7 } })).toEqual({ kind: "slot", slot: { week: 1, day: 7 } });
    expect(parse({ kind: "library", id: "lib-1" })).toEqual({ kind: "library", id: "lib-1" });
  });

  it("rejects malformed JSON and wrong shapes", () => {
    expect(parse("{not json")).toBeNull();
    expect(parse("null")).toBeNull();
    expect(parse({ kind: "other" })).toBeNull();
    expect(parse({ kind: "slot" })).toBeNull();
    expect(parse({ kind: "slot", slot: { week: "0", day: 1 } })).toBeNull();
  });

  it("rejects slots outside the plan", () => {
    expect(parse({ kind: "slot", slot: { week: 2, day: 1 } })).toBeNull();
    expect(parse({ kind: "slot", slot: { week: -1, day: 1 } })).toBeNull();
    expect(parse({ kind: "slot", slot: { week: 0.5, day: 1 } })).toBeNull();
    expect(parse({ kind: "slot", slot: { week: 0, day: 0 } })).toBeNull();
    expect(parse({ kind: "slot", slot: { week: 0, day: 8 } })).toBeNull();
  });

  it("rejects unknown library workouts", () => {
    expect(parse({ kind: "library", id: "lib-2" })).toBeNull();
  });
});
