"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, FormError } from "@/components/ui/form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { WORKOUT_LIMITS as L } from "@/config/training";
import { weekTotals } from "@/lib/custom-plans/ops";
import type { LocalDate } from "@/lib/time";
import type { Units } from "@/lib/units";
import { activateCustomPlanAction, deleteCustomPlanAction } from "@/server/actions/custom-plans";
import type { LibraryWorkout } from "@/server/actions/workouts";
import { ActivateDialog } from "./activate-dialog";
import { ShareDialog } from "./share-dialog";
import { EditorPanel } from "./editor-panel";
import { usePlanBuilder, type BuilderPlan } from "./use-plan-builder";
import { WeekGrid } from "./week-grid";
import { WeekChips, WeekList } from "./week-list";

/** Week-by-week custom plan editor: weeks (left), the selected week (centre), the workout editor (right). */
export function PlanBuilder({
  plan,
  library: initialLibrary,
  units,
  today,
  isActive,
  replacesActive,
  share,
}: {
  plan: BuilderPlan;
  library: LibraryWorkout[];
  units: Units;
  today: LocalDate;
  isActive: boolean;
  replacesActive: boolean;
  share: { shareUrl: string | null; enabled: boolean };
}) {
  const { state, dispatch, save, retrySync, saving, status } = usePlanBuilder(plan);
  const [library, setLibrary] = useState(initialLibrary);
  const [showDescription, setShowDescription] = useState(plan.description !== null);

  const weeks = state.doc.weeks.length;
  const maxRuns = Math.max(0, ...state.doc.weeks.map((w) => weekTotals(w).runs));
  const nameMissing = state.name.trim() === "";
  const sel = state.selected;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href="/plans" className="text-sm text-muted">
            My plans ›
          </Link>
          <input
            aria-label="Plan name"
            value={state.name}
            maxLength={L.nameMax}
            onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
            placeholder="Plan name"
            className="w-full min-w-0 rounded-lg bg-transparent font-condensed text-3xl leading-none font-extrabold uppercase outline-none focus:bg-surface focus:ring-2 focus:ring-accent/20"
          />
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {isActive ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground uppercase">Active</span>
            ) : null}
            <span>
              {weeks} week{weeks === 1 ? "" : "s"} · up to {maxRuns} run{maxRuns === 1 ? "" : "s"}/week
            </span>
            <button type="button" className="font-medium text-accent" onClick={() => setShowDescription((v) => !v)} aria-expanded={showDescription}>
              {showDescription ? "Hide description" : state.description ? "Show description" : "Add description"}
            </button>
          </p>
          {showDescription ? (
            <textarea
              aria-label="Description"
              rows={2}
              maxLength={L.notesMax}
              value={state.description ?? ""}
              onChange={(e) => dispatch({ type: "describe", description: e.target.value })}
              placeholder="What this plan is for, how to run it…"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 lg:max-w-xl"
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.dirty ? <span className="text-sm text-muted">Unsaved changes</span> : status.kind === "saved" ? <span className="text-sm text-muted">Saved</span> : null}
          <Button type="button" variant="ink" onClick={save} disabled={!state.dirty || saving || nameMissing || status.kind === "conflict"}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Link
            href={`/plans/${plan.id}/preview`}
            className="rounded-xl border border-border bg-surface px-4 py-2.5 font-semibold"
          >
            Preview
          </Link>
          <ShareDialog planId={plan.id} initial={share} disabledReason={state.dirty ? "Save your changes before sharing" : null} />
          <ActivateDialog
            action={activateCustomPlanAction.bind(null, plan.id)}
            today={today}
            replacesActive={replacesActive}
            disabledReason={state.dirty ? "Save your changes before activating" : null}
          />
          <form action={deleteCustomPlanAction.bind(null, plan.id)}>
            <ConfirmSubmitButton
              variant="secondary"
              pendingLabel="Deleting…"
              confirmMessage={`Delete “${plan.name}”?${isActive ? " It is your active plan: its upcoming sessions will be removed." : ""} This can't be undone.`}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </header>

      {status.kind === "conflict" ? (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
          This plan was changed in another tab. Reload to see the latest version.
        </p>
      ) : null}
      {status.kind === "syncFailed" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          <span className="min-w-0 flex-1">
            {status.message ?? "Plan saved, but your upcoming sessions couldn't be updated."}
          </span>
          <Button type="button" variant="secondary" onClick={retrySync} disabled={saving}>
            {saving ? "Retrying…" : "Retry sync"}
          </Button>
        </div>
      ) : null}
      {status.kind === "error" ? <FormError>{status.message}</FormError> : null}
      {nameMissing ? <FormError>Give the plan a name to save it.</FormError> : null}

      <WeekChips state={state} units={units} dispatch={dispatch} />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[170px_minmax(0,1fr)_330px] lg:items-start lg:gap-3.5">
        <WeekList state={state} units={units} dispatch={dispatch} />
        <WeekGrid state={state} library={library} units={units} dispatch={dispatch} />
        <EditorPanel
          key={sel ? `${sel.week}:${sel.day}` : "none"}
          state={state}
          units={units}
          dispatch={dispatch}
          onSavedToLibrary={(w) => setLibrary((l) => [w, ...l])}
        />
      </div>
    </div>
  );
}
