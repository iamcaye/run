import { useId } from "react";

/** Single-choice chip row backed by radios (arrow keys move between options). */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  hideLabel = false,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="flex items-center justify-between gap-3 text-sm">
      <legend className={hideLabel ? "sr-only" : "float-left text-muted"}>{label}</legend>
      <div className="ml-auto flex flex-wrap justify-end gap-1">
        {options.map((o) => (
          <label key={String(o.value)} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={String(o.value)}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span className="inline-block rounded-full border border-foreground px-2.5 py-1 text-xs font-semibold peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
