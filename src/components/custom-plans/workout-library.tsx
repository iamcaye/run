"use client";

import type { LibraryWorkout } from "@/server/actions/workouts";
import { startDrag } from "./day-cell";

/** My workouts as chips to drag onto a day (lg+); smaller screens use each day's picker. */
export function WorkoutLibrary({ library }: { library: LibraryWorkout[] }) {
  return (
    <section aria-labelledby="library-heading" className="flex flex-col gap-2">
      <h3 id="library-heading" className="text-xs font-semibold tracking-wider text-muted uppercase">
        My workouts<span className="hidden lg:inline"> · drag onto a day</span>
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {library.map((w) => (
          <span
            key={w.id}
            draggable
            onDragStart={(e) => startDrag(e, { kind: "library", id: w.id })}
            className="hidden cursor-grab rounded-[10px] border border-border bg-surface px-2.5 py-1.5 text-sm font-semibold lg:inline-block"
          >
            {w.name}
          </span>
        ))}
        {library.length === 0 ? (
          <span className="text-sm text-muted">Save workouts here to reuse them across weeks.</span>
        ) : (
          <span className="text-sm text-muted lg:hidden">
            {library.length} saved — add them from each day&apos;s picker.
          </span>
        )}
        <a
          href="/workouts/new"
          target="_blank"
          rel="noopener"
          className="rounded-full border-[1.5px] border-foreground px-3 py-1 text-sm font-semibold"
        >
          + New workout
        </a>
      </div>
    </section>
  );
}
