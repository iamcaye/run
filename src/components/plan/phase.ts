import type { Phase } from "@/lib/planning/types";

/** Static class names so Tailwind can see them. */
export const PHASE_BG: Readonly<Record<Phase, string>> = {
  base: "bg-phase-base",
  build: "bg-phase-build",
  specific: "bg-phase-specific",
  taper: "bg-phase-taper",
  race: "bg-phase-race",
};
