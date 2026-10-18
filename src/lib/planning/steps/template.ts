import { PLANNING, type DistanceKey, type Level, type SessionType } from "@/config/training";
import type { Phase } from "../types";

export type QualityType = Extract<SessionType, "tempo" | "intervals" | "race_pace">;

export type WeekTemplate = {
  long: boolean;
  /** Finish the long run with a race-pace segment (half/marathon specific weeks). */
  longRacePaceFinish: boolean;
  /** Quality sessions in priority order (first is kept when days are short). */
  quality: QualityType[];
  /** Turn the first easy run into strides. */
  strides: boolean;
  race: boolean;
};

const isShort = (d: DistanceKey) => d === "5k" || d === "10k";

/**
 * What a week contains, by phase and level:
 * base = easy + long + strides; build = 1–2 quality + long; specific = race-pace work;
 * taper = same intensity, less volume; race = the race plus easy shakeouts.
 */
export function sessionTemplate(input: {
  phase: Phase;
  level: Level;
  distanceKey: DistanceKey;
  /** Week number within its phase (alternates beginner quality). */
  weekInPhase: number;
}): WeekTemplate {
  const { phase, level, distanceKey, weekInPhase } = input;
  const beginner = level === "beginner";
  const short = isShort(distanceKey);

  let quality: QualityType[];
  switch (phase) {
    case "base":
      quality = [];
      break;
    case "build":
      quality = beginner
        ? [weekInPhase % 2 === 0 ? "tempo" : "intervals"]
        : short
          ? ["intervals", "tempo"]
          : ["tempo", "intervals"];
      break;
    case "specific":
      quality = beginner ? ["race_pace"] : short ? ["intervals", "race_pace"] : ["race_pace", "tempo"];
      break;
    case "taper":
      quality = beginner ? ["race_pace"] : short ? ["race_pace", "intervals"] : ["race_pace", "tempo"];
      break;
    case "race":
      quality = [];
      break;
  }

  return {
    long: phase !== "race",
    longRacePaceFinish: phase === "specific" && !short && !beginner,
    quality: quality.slice(0, PLANNING.maxQualityPerWeek[level]),
    strides: phase === "base" || phase === "race",
    race: phase === "race",
  };
}
