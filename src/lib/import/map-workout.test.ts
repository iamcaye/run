// TODO(real-fixture): these fixtures are PROVISIONAL (hand-written from the Health Auto Export docs).
// When a real anonymized export arrives, add it as fixtures/hae/real-*.json, add a test below, and
// adjust only mapWorkout() if field names differ — the import pipeline should not need changes.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import legacy from "./__fixtures__/hae/provisional-v1-legacy.json";
import mixed from "./__fixtures__/hae/provisional-v2-mixed.json";
import outdoorRun from "./__fixtures__/hae/provisional-v2-outdoor-run.json";
import { mapWorkout } from "./map-workout";
import { matchSession } from "./match";
import { parseHaeDate, toKm } from "./parse";
import { HaePayloadSchema } from "./schema";

const ctx = { timeZone: "Europe/Madrid" };

describe("parseHaeDate", () => {
  it("parses the HAE default format with offset", () => {
    expect(parseHaeDate("2026-10-18 08:02:11 +0200", "UTC")?.toISOString()).toBe("2026-10-18T06:02:11.000Z");
    expect(parseHaeDate("2026-01-05 23:30:00 -0500", "UTC")?.toISOString()).toBe("2026-01-06T04:30:00.000Z");
  });

  it("parses ISO variants", () => {
    expect(parseHaeDate("2026-10-18T08:02:11Z", "UTC")?.toISOString()).toBe("2026-10-18T08:02:11.000Z");
    expect(parseHaeDate("2026-10-18T08:02:11+02:00", "UTC")?.toISOString()).toBe("2026-10-18T06:02:11.000Z");
    expect(parseHaeDate("2026-10-18T08:02:11.250+0200", "UTC")?.toISOString()).toBe("2026-10-18T06:02:11.250Z");
  });

  it("uses the fallback zone when there is no offset (DST-aware)", () => {
    expect(parseHaeDate("2026-07-01 08:00:00", "Europe/Madrid")?.toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(parseHaeDate("2026-12-01 08:00:00", "Europe/Madrid")?.toISOString()).toBe("2026-12-01T07:00:00.000Z");
  });

  it("accepts epoch seconds/ms and rejects junk", () => {
    expect(parseHaeDate(1_760_000_000, "UTC")?.getTime()).toBe(1_760_000_000_000);
    expect(parseHaeDate(1_760_000_000_000, "UTC")?.getTime()).toBe(1_760_000_000_000);
    for (const bad of ["not a date", "2026-13-45 99:99:99 +0200", "", null, undefined, {}]) {
      expect(parseHaeDate(bad, "UTC"), String(bad)).toBeNull();
    }
  });

  it("round-trips any instant written in HAE format with any offset", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z"), noInvalidDate: true }),
        fc.integer({ min: -12 * 60, max: 14 * 60 }).map((m) => m - (m % 15)),
        (instant, offsetMin) => {
          const t = new Date(Math.floor(instant.getTime() / 1000) * 1000);
          const local = new Date(t.getTime() + offsetMin * 60_000);
          const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
          const sign = offsetMin < 0 ? "-" : "+";
          const s = `${local.toISOString().slice(0, 10)} ${local.toISOString().slice(11, 19)} ${sign}${pad(Math.trunc(offsetMin / 60))}${pad(offsetMin % 60)}`;
          expect(parseHaeDate(s, "UTC")?.getTime()).toBe(t.getTime());
        },
      ),
    );
  });
});

describe("toKm", () => {
  it("normalises units", () => {
    expect(toKm(5000, "m")).toBe(5);
    expect(toKm(1, "mi")).toBeCloseTo(1.609344);
    expect(toKm("10", "KM")).toBe(10);
    expect(toKm(3, undefined)).toBe(3);
    expect(toKm(3, "furlongs")).toBeNull();
    expect(toKm(-1, "km")).toBeNull();
  });
});

describe("mapWorkout — provisional v2 outdoor run", () => {
  const payload = HaePayloadSchema.parse(outdoorRun);
  const result = mapWorkout(payload.data.workouts[0], ctx);

  it("maps core fields", () => {
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.workout).toMatchObject({
      externalId: "8F2C5B1E-6A3D-4E7B-9C1A-2D4F6B8E0A13",
      name: "Outdoor Run",
      seconds: 2790,
      km: 8.12,
      avgHr: 149,
      maxHr: 171,
    });
    expect(result.workout.startAt.toISOString()).toBe("2026-10-18T06:02:11.000Z");
  });

  it("maps HR samples relative to the start and the route", () => {
    if (result.status !== "ok") throw new Error();
    expect(result.workout.hrSeries).toEqual([
      { t: 0, bpm: 101 },
      { t: 600, bpm: 144 },
      { t: 1800, bpm: 156 },
      { t: 2700, bpm: 167 },
    ]);
    expect(result.workout.route).toHaveLength(4);
    expect(result.workout.route[1]).toEqual({
      lat: 39.47021,
      lon: -0.37698,
      altitude: 15.6,
      timestamp: new Date("2026-10-18T06:02:31Z"),
    });
  });
});

describe("mapWorkout — provisional v2 mixed", () => {
  const results = HaePayloadSchema.parse(mixed).data.workouts.map((w) => mapWorkout(w, ctx));

  it("imports runs only (outdoor and indoor), skips others, flags broken ones", () => {
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "skipped", "skipped", "invalid"]);
    const indoor = results[1];
    if (indoor?.status !== "ok") throw new Error();
    expect(indoor.workout.km).toBe(5); // metres → km
    expect(indoor.workout.route).toEqual([]);
    expect(indoor.workout.hrSeries).toBeNull();
    expect(results[4]).toMatchObject({ status: "invalid", reason: expect.stringContaining("start date") });
  });
});

describe("mapWorkout — provisional v1 legacy", () => {
  const result = mapWorkout(HaePayloadSchema.parse(legacy).data.workouts[0], ctx);

  it("handles plain numbers, miles, nested heartRate, lat/long names and missing id", () => {
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.workout.km).toBeCloseTo(9.978, 3);
    expect(result.workout.seconds).toBe(3670); // end − start (no duration field)
    expect(result.workout.avgHr).toBe(152);
    expect(result.workout.maxHr).toBe(178);
    expect(result.workout.hrSeries).toEqual([
      { t: 0, bpm: 110 },
      { t: 1800, bpm: 155 },
    ]);
    expect(result.workout.route.map((p) => [p.lat, p.lon, p.altitude])).toEqual([
      [51.5074, -0.1278, 11],
      [51.5079, -0.1269, 12],
    ]); // the out-of-range point is dropped
    expect(result.workout.externalId).toMatch(/^hae:[0-9a-f]{32}$/);
  });

  it("derives the same id on re-send (idempotency)", () => {
    const again = mapWorkout(HaePayloadSchema.parse(legacy).data.workouts[0], ctx);
    expect(again.status === "ok" && result.status === "ok" && again.workout.externalId === result.workout.externalId).toBe(true);
  });
});

describe("payload envelope", () => {
  it("rejects payloads without data.workouts container and tolerates extra fields", () => {
    expect(HaePayloadSchema.safeParse({ foo: 1 }).success).toBe(false);
    expect(HaePayloadSchema.parse({ data: { metrics: [] }, extra: true }).data.workouts).toEqual([]);
  });
});

describe("matchSession", () => {
  const sessions = [
    { id: "a", date: "2026-10-18", type: "easy", targetKm: 6 },
    { id: "b", date: "2026-10-18", type: "long", targetKm: 14 },
    { id: "c", date: "2026-10-19", type: "rest", targetKm: 0 },
  ];

  it("same local date, closest target distance", () => {
    expect(matchSession({ localDate: "2026-10-18", km: 12 }, sessions, new Set())).toBe("b");
    expect(matchSession({ localDate: "2026-10-18", km: 5 }, sessions, new Set())).toBe("a");
  });

  it("skips rest days, other dates and already-claimed sessions", () => {
    expect(matchSession({ localDate: "2026-10-19", km: 5 }, sessions, new Set())).toBeNull();
    expect(matchSession({ localDate: "2026-10-17", km: 5 }, sessions, new Set())).toBeNull();
    expect(matchSession({ localDate: "2026-10-18", km: 12 }, sessions, new Set(["b"]))).toBe("a");
  });
});
