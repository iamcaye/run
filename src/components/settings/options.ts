import { ISO_WEEKDAYS, WEEKDAY_LABELS } from "@/lib/time";

export const weekdayOptions = ISO_WEEKDAYS.map((d) => ({
  value: String(d),
  label: WEEKDAY_LABELS[d].long,
}));

export const weekdayChipOptions = ISO_WEEKDAYS.map((d) => ({
  value: String(d),
  label: WEEKDAY_LABELS[d].short,
}));

export const unitOptions = [
  { value: "km", label: "Kilometres" },
  { value: "mi", label: "Miles" },
] as const;

export const maxRunsOptions = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  value: String(n),
  label: `${n} run${n === 1 ? "" : "s"}`,
}));
