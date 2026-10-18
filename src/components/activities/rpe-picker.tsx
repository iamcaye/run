"use client";

import { RPE_LABELS } from "./rpe";

/** Big tap targets: a 5×2 grid of radio buttons named `rpe`. */
export function RpePicker({ defaultValue, error }: { defaultValue?: number | null; error?: string[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">How hard did it feel? (RPE)</legend>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <label key={n} className="cursor-pointer">
            <input type="radio" name="rpe" value={n} defaultChecked={defaultValue === n} className="peer sr-only" />
            <span className="flex h-14 flex-col items-center justify-center rounded-lg border border-border bg-surface text-lg font-semibold tabular-nums peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
              {n}
              <span className="text-[10px] font-normal leading-none opacity-80">{RPE_LABELS[n]}</span>
            </span>
          </label>
        ))}
      </div>
      {error?.length ? <span className="text-sm text-danger">{error[0]}</span> : null}
    </fieldset>
  );
}
