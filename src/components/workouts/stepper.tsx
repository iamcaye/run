import { useId, useState, type KeyboardEvent } from "react";
import { stepValue, type Bounds } from "@/lib/custom-plans/editor-model";

const buttonClass =
  "grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-lg font-bold leading-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent";

/**
 * Label + −/value/+ control. The value is also typed: it's committed on blur or Enter (unparseable
 * input reverts), Escape cancels, and ↑/↓ step like the buttons.
 */
export function Stepper({
  label,
  value,
  bounds,
  format,
  parse,
  onChange,
  stepFn,
  suffix,
  inputMode = "decimal",
}: {
  label: string;
  value: number;
  bounds: Bounds;
  format: (value: number) => string;
  parse: (input: string) => number | null;
  onChange: (value: number) => void;
  /** Custom −/+ rule; defaults to snapping to multiples of `bounds.step`, never below one step. */
  stepFn?: (value: number, dir: 1 | -1) => number;
  suffix?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const next = (dir: 1 | -1) => (stepFn ? stepFn(value, dir) : stepValue(value, bounds.step, dir, bounds.max));
  const down = next(-1);
  const up = next(1);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const v = parse(draft);
    if (v !== null) onChange(Math.min(bounds.max, Math.max(bounds.min, v)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      setDraft(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      setDraft(null);
      const v = e.key === "ArrowUp" ? up : down;
      if (v !== value) onChange(v);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <label htmlFor={id} className="text-muted">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <button type="button" className={buttonClass} aria-label={`Decrease ${label}`} disabled={down === value} onClick={() => onChange(down)}>
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={draft ?? format(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="w-[4.5rem] rounded-lg border border-border bg-surface px-1 py-1.5 text-center font-semibold tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <button type="button" className={buttonClass} aria-label={`Increase ${label}`} disabled={up === value} onClick={() => onChange(up)}>
          +
        </button>
        {suffix ? <span className="w-8 text-xs text-muted">{suffix}</span> : null}
      </div>
    </div>
  );
}
