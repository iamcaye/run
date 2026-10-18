import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeSplits, haversineKm } from "./splits";

/** A straight track north from (40, -3) at constant pace: one point every `stepKm`. */
function track(totalKm: number, paceSecPerKm: number, stepKm = 0.05) {
  const kmPerDegLat = 111.19;
  const t0 = Date.parse("2026-10-18T07:00:00Z");
  const n = Math.round(totalKm / stepKm);
  return Array.from({ length: n + 1 }, (_, i) => ({
    lat: 40 + (i * stepKm) / kmPerDegLat,
    lon: -3,
    timestamp: new Date(t0 + i * stepKm * paceSecPerKm * 1000),
  }));
}

describe("haversine", () => {
  it("Madrid → Barcelona ≈ 505 km", () => {
    expect(haversineKm({ lat: 40.4168, lon: -3.7038 }, { lat: 41.3874, lon: 2.1686 })).toBeCloseTo(505, -1);
  });
});

describe("splits", () => {
  it("constant pace gives equal splits plus a partial last one", () => {
    const splits = computeSplits(track(5.5, 300), { totalKm: 5.5 });
    expect(splits.map((s) => s.km)).toEqual([1, 1, 1, 1, 1, 0.5]);
    for (const s of splits) {
      expect(s.paceSecPerKm).toBeGreaterThanOrEqual(299);
      expect(s.paceSecPerKm).toBeLessThanOrEqual(301);
    }
  });

  it("rescales GPS distance to the watch total", () => {
    // GPS says ~5 km; the watch measured 5.2 → 5 full splits + a 0.2 km one.
    const splits = computeSplits(track(5, 300), { totalKm: 5.2 });
    expect(splits).toHaveLength(6);
    expect(splits.at(-1)?.km).toBeCloseTo(0.2, 6);
  });

  it("negative split shows up", () => {
    const a = track(2, 330);
    const t0 = a.at(-1)?.timestamp?.getTime() ?? 0;
    const b = track(2, 270).slice(1).map((p) => ({ ...p, lat: p.lat + 2 / 111.19, timestamp: new Date(t0 + ((p.timestamp?.getTime() ?? 0) - Date.parse("2026-10-18T07:00:00Z"))) }));
    const splits = computeSplits([...a, ...b], { totalKm: 4 });
    expect(splits[0]?.paceSecPerKm).toBeCloseTo(330, -1);
    expect(splits[3]?.paceSecPerKm).toBeCloseTo(270, -1);
  });

  it("no timestamps or a single point → no splits", () => {
    expect(computeSplits([{ lat: 1, lon: 1, timestamp: null }, { lat: 2, lon: 2, timestamp: null }])).toEqual([]);
    expect(computeSplits(track(0, 300))).toEqual([]);
  });

  it("split times add up to the track duration", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.3, max: 25, noNaN: true }), fc.integer({ min: 180, max: 480 }), (km, pace) => {
        const t = track(km, pace, 0.1);
        const total = ((t.at(-1)?.timestamp?.getTime() ?? 0) - (t[0]?.timestamp?.getTime() ?? 0)) / 1000;
        const splits = computeSplits(t, { minLastKm: 0 });
        const sum = splits.reduce((a, s) => a + s.seconds, 0);
        expect(Math.abs(sum - total)).toBeLessThanOrEqual(splits.length); // rounding only
      }),
    );
  });
});
