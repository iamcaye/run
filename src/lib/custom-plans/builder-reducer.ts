import { WORKOUT_LIMITS as L } from "@/config/training";
import { addEmptyWeek, duplicateWeek, moveWeek, moveWorkout, removeWeek, setDay } from "./ops";
import type { CustomPlanDoc, DaySlot, PlanWorkout } from "./types";

export type BuilderState = {
  doc: CustomPlanDoc;
  name: string;
  description: string | null;
  /** The day whose workout is open in the editor. */
  selected: DaySlot | null;
  /** The week shown in the centre grid. */
  selectedWeek: number;
  /** Changed since the last save. */
  dirty: boolean;
};

export type BuilderAction =
  | { type: "duplicateWeek"; index: number }
  | { type: "addWeek" }
  | { type: "removeWeek"; index: number }
  | { type: "moveWeek"; from: number; to: number }
  | { type: "selectWeek"; index: number }
  | { type: "select"; slot: DaySlot | null }
  | { type: "setDay"; slot: DaySlot; workout: PlanWorkout | null }
  | { type: "move"; from: DaySlot; to: DaySlot }
  | { type: "copy"; from: DaySlot; to: DaySlot }
  | { type: "rename"; name: string }
  | { type: "describe"; description: string }
  | { type: "saved" };

export function initBuilder(plan: { name: string; description: string | null; doc: CustomPlanDoc }): BuilderState {
  return { ...plan, selected: null, selectedWeek: 0, dirty: false };
}

const clamp = (i: number, len: number) => Math.min(Math.max(i, 0), Math.max(len - 1, 0));

/** Re-points the week/slot selection at the same week ids after the week list changed shape. */
function reselect(s: BuilderState, doc: CustomPlanDoc): Pick<BuilderState, "selected" | "selectedWeek"> {
  const idAt = (i: number) => s.doc.weeks[i]?.id;
  const indexOf = (id: string | undefined) => doc.weeks.findIndex((w) => w.id === id);
  const week = indexOf(idAt(s.selectedWeek));
  const slotWeek = s.selected ? indexOf(idAt(s.selected.week)) : -1;
  return {
    selectedWeek: week >= 0 ? week : clamp(s.selectedWeek, doc.weeks.length),
    selected: s.selected && slotWeek >= 0 ? { week: slotWeek, day: s.selected.day } : null,
  };
}

/** Pure state transitions of the plan builder. `newId` mints week ids (crypto.randomUUID in the UI). */
export function builderReducer(s: BuilderState, a: BuilderAction, newId: () => string): BuilderState {
  const full = s.doc.weeks.length >= L.maxWeeks;
  switch (a.type) {
    case "addWeek": {
      if (full) return s;
      const doc = addEmptyWeek(s.doc, newId);
      return { ...s, doc, selectedWeek: doc.weeks.length - 1, selected: null, dirty: true };
    }
    case "duplicateWeek": {
      if (full || !s.doc.weeks[a.index]) return s;
      return { ...s, doc: duplicateWeek(s.doc, a.index, newId), selectedWeek: a.index + 1, selected: null, dirty: true };
    }
    case "removeWeek": {
      if (s.doc.weeks.length <= 1 || !s.doc.weeks[a.index]) return s;
      const doc = removeWeek(s.doc, a.index);
      return { ...s, doc, ...reselect(s, doc), dirty: true };
    }
    case "moveWeek": {
      const doc = moveWeek(s.doc, a.from, a.to);
      if (doc === s.doc) return s;
      return { ...s, doc, ...reselect(s, doc), dirty: true };
    }
    case "selectWeek":
      return { ...s, selectedWeek: clamp(a.index, s.doc.weeks.length), selected: null };
    case "select":
      return { ...s, selected: a.slot, selectedWeek: a.slot ? a.slot.week : s.selectedWeek };
    case "setDay": {
      const doc = setDay(s.doc, a.slot, a.workout);
      if (doc === s.doc) return s;
      const sameSlot = s.selected?.week === a.slot.week && s.selected.day === a.slot.day;
      const selected = a.workout ? a.slot : sameSlot ? null : s.selected;
      return { ...s, doc, selected, selectedWeek: a.workout ? a.slot.week : s.selectedWeek, dirty: true };
    }
    case "move": {
      const doc = moveWorkout(s.doc, a.from, a.to);
      if (doc === s.doc) return s;
      return { ...s, doc, selected: a.to, selectedWeek: a.to.week, dirty: true };
    }
    case "copy": {
      const workout = s.doc.weeks[a.from.week]?.days[a.from.day - 1];
      if (!workout) return s;
      const doc = setDay(s.doc, a.to, structuredClone(workout));
      return doc === s.doc ? s : { ...s, doc, dirty: true };
    }
    case "rename":
      return { ...s, name: a.name, dirty: true };
    case "describe":
      return { ...s, description: a.description.trim() === "" ? null : a.description, dirty: true };
    case "saved":
      return { ...s, dirty: false };
  }
}
