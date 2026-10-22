import { estimateWorkout } from "./estimate";
import type { CustomPlanDoc, CustomPlanWeek, DaySlot, PlanWorkout } from "./types";

const DAYS = 7;
const QUALITY = new Set(["tempo", "intervals", "race_pace", "race"]);

export function emptyWeek(newId: () => string): CustomPlanWeek {
  return { id: newId(), days: Array.from({ length: DAYS }, () => null) };
}

export function addEmptyWeek(doc: CustomPlanDoc, newId: () => string): CustomPlanDoc {
  return { weeks: [...doc.weeks, emptyWeek(newId)] };
}

export function duplicateWeek(doc: CustomPlanDoc, index: number, newId: () => string): CustomPlanDoc {
  const src = doc.weeks[index];
  if (!src) return doc;
  const copy: CustomPlanWeek = { id: newId(), days: structuredClone(src.days) };
  return { weeks: [...doc.weeks.slice(0, index + 1), copy, ...doc.weeks.slice(index + 1)] };
}

export function removeWeek(doc: CustomPlanDoc, index: number): CustomPlanDoc {
  return { weeks: doc.weeks.filter((_, i) => i !== index) };
}

export function moveWeek(doc: CustomPlanDoc, from: number, to: number): CustomPlanDoc {
  const w = doc.weeks[from];
  if (!w || to < 0 || to >= doc.weeks.length) return doc;
  const rest = doc.weeks.filter((_, i) => i !== from);
  rest.splice(to, 0, w);
  return { weeks: rest };
}

function withDays(doc: CustomPlanDoc, edits: [DaySlot, PlanWorkout | null][]): CustomPlanDoc {
  const weeks = doc.weeks.map((w) => ({ ...w, days: [...w.days] }));
  for (const [slot, workout] of edits) {
    const w = weeks[slot.week];
    if (!w) return doc;
    w.days[slot.day - 1] = workout;
  }
  return { weeks };
}

export function setDay(doc: CustomPlanDoc, slot: DaySlot, workout: PlanWorkout | null): CustomPlanDoc {
  return withDays(doc, [[slot, workout]]);
}

/** Moves a workout to another day; swaps if the target is occupied. */
export function moveWorkout(doc: CustomPlanDoc, from: DaySlot, to: DaySlot): CustomPlanDoc {
  const a = doc.weeks[from.week]?.days[from.day - 1] ?? null;
  const b = doc.weeks[to.week]?.days[to.day - 1] ?? null;
  if (!doc.weeks[from.week] || !doc.weeks[to.week]) return doc;
  return withDays(doc, [
    [from, b],
    [to, a],
  ]);
}

export function weekTotals(week: CustomPlanWeek): { km: number; seconds: number; runs: number; quality: number } {
  let km = 0;
  let seconds = 0;
  let runs = 0;
  let quality = 0;
  for (const d of week.days) {
    if (!d) continue;
    const e = estimateWorkout(d.steps);
    km += e.km;
    seconds += e.seconds;
    runs += 1;
    if (QUALITY.has(d.type)) quality += 1;
  }
  return { km, seconds, runs, quality };
}
