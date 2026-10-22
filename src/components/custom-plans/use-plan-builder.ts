"use client";

import { useEffect, useReducer, useRef, useState, useTransition } from "react";
import { builderReducer, initBuilder, type BuilderAction, type BuilderState } from "@/lib/custom-plans/builder-reducer";
import { emptyWeek } from "@/lib/custom-plans/ops";
import type { CustomPlanDoc } from "@/lib/custom-plans/types";
import { retryPlanSyncAction, saveCustomPlanAction } from "@/server/actions/custom-plans";

export type BuilderPlan = { id: string; name: string; description: string | null; doc: CustomPlanDoc; version: number };

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saved" }
  /** Saved, but the followed plan's sessions weren't updated; `retrySync` tries again. */
  | { kind: "syncFailed"; message: string | null }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

const newId = () => crypto.randomUUID();
const reducer = (s: BuilderState, a: BuilderAction) => builderReducer(s, a, newId);

/** Builder state, optimistic save with version check, and an unsaved-changes guard. */
export function usePlanBuilder(plan: BuilderPlan) {
  const [state, dispatch] = useReducer(reducer, plan, (p) =>
    initBuilder({ ...p, doc: p.doc.weeks.length ? p.doc : { weeks: [emptyWeek(newId)] } }),
  );
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [saving, startSaving] = useTransition();
  const version = useRef(plan.version);
  const latest = useRef(state);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    if (!state.dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [state.dirty]);

  const save = () => {
    const sent = state;
    startSaving(async () => {
      const r = await saveCustomPlanAction(plan.id, {
        name: sent.name,
        description: sent.description,
        doc: sent.doc,
        version: version.current,
      });
      if (r.status === "saved" || r.status === "saved_not_synced") {
        version.current = r.version;
        setStatus(r.status === "saved" ? { kind: "saved" } : { kind: "syncFailed", message: null });
        // Edits made while the request was in flight stay unsaved.
        const now = latest.current;
        if (now.doc === sent.doc && now.name === sent.name && now.description === sent.description) dispatch({ type: "saved" });
      } else if (r.status === "conflict") {
        setStatus({ kind: "conflict" });
      } else {
        setStatus({ kind: "error", message: r.message });
      }
    });
  };

  const retrySync = () => {
    startSaving(async () => {
      const r = await retryPlanSyncAction(plan.id);
      setStatus(r.status === "synced" ? { kind: "saved" } : { kind: "syncFailed", message: r.message });
    });
  };

  const act = (a: BuilderAction) => {
    dispatch(a);
    if (status.kind === "saved" || status.kind === "error") setStatus({ kind: "idle" });
  };

  return { state, dispatch: act, save, retrySync, saving, status };
}
