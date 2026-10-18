export const RPE_LABELS: Readonly<Record<number, string>> = {
  1: "Very easy",
  2: "Easy",
  3: "Easy",
  4: "Comfortable",
  5: "Moderate",
  6: "Steady-hard",
  7: "Hard",
  8: "Very hard",
  9: "Near max",
  10: "Max",
};

export function rpeLabel(rpe: number): string {
  return RPE_LABELS[rpe] ?? "";
}
