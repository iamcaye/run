/**
 * Every tunable number used by planning, metrics, adaptation, import and the cron job.
 * Domain code must read from here — no magic numbers in `lib/`.
 */

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export const DISTANCE_KEYS = ["5k", "10k", "half", "marathon"] as const;
export type DistanceKey = (typeof DISTANCE_KEYS)[number];

type PerDistance<T> = Readonly<Record<DistanceKey, T>>;
type PerLevel<T> = Readonly<Record<Level, T>>;
type Range = readonly [min: number, max: number];

/** Preset race distances in km (goal form presets). */
export const DISTANCE_PRESETS_KM: PerDistance<number> = {
  "5k": 5,
  "10k": 10,
  half: 21.0975,
  marathon: 42.195,
};

/** Custom distances map to the nearest category for config lookups (upper bounds, km). */
export const DISTANCE_CATEGORY_UPPER_KM: PerDistance<number> = {
  "5k": 7.5,
  "10k": 15,
  half: 30,
  marathon: Number.POSITIVE_INFINITY,
};

export function distanceKeyFor(distanceKm: number): DistanceKey {
  return DISTANCE_KEYS.find((k) => distanceKm <= DISTANCE_CATEGORY_UPPER_KM[k]) ?? "marathon";
}

export const PLANNING = {
  /** Below this many weeks the plan is compressed and a warning is returned. */
  minWeeks: { "5k": 6, "10k": 8, half: 10, marathon: 14 } satisfies PerDistance<number>,
  /** Weeks beyond this go to a leading `base` maintenance block. */
  maxCoreWeeks: 20,

  /**
   * Taper weekly volume as a fraction of peak. The count INCLUDES race week (phase `race`),
   * which is always the last entry.
   */
  taperFractions: {
    "5k": [0.55],
    "10k": [0.55],
    half: [0.72, 0.5],
    marathon: [0.85, 0.72, 0.5],
  } satisfies PerDistance<readonly number[]>,

  /** Split of the non-taper weeks. */
  phaseSplit: { base: 0.35, build: 0.35, specific: 0.3 },
  /** If startWeeklyKm is below this fraction of the peak, move `shift` of the split from build to base. */
  lowVolumeBaseShift: { belowPeakFraction: 0.6, shift: 0.1 },

  /** Target peak weekly km by distance × level (clamped by what's reachable from startWeeklyKm). */
  peakWeeklyKm: {
    "5k": { beginner: 25, intermediate: 40, advanced: 55 },
    "10k": { beginner: 30, intermediate: 45, advanced: 65 },
    half: { beginner: 35, intermediate: 48, advanced: 65 },
    marathon: { beginner: 50, intermediate: 70, advanced: 90 },
  } satisfies PerDistance<PerLevel<number>>,

  maxWeeklyIncrease: 0.1,
  /** 3 up + 1 deload. */
  deload: { cycleLength: 4, fraction: 0.78 },

  /** Week-1 volume floor so very low starting volumes can still progress in 10% steps. */
  minStartWeeklyKm: 8,

  longRun: {
    shareOfWeek: [0.25, 0.35] as Range,
    /** 5K/10K share by number of runs that week: ≤3 runs → 35%, 4 → 30%, ≥5 → 25%. */
    shareByRuns: { upTo3: 0.35, four: 0.3, fivePlus: 0.25 },
    /** Half/marathon always use the top of the range — the long run is the key session. */
    shareLongDistances: 0.35,
    /** A partial first week with this few usable days gets easy runs only. */
    skipInPartialWeekWithDays: 2,
    maxIncreaseKmPerWeek: 2,
    capKm: { "5k": 10, "10k": 14, half: 20, marathon: 32 } satisfies PerDistance<number>,
    /** In `specific` weeks the long run (half/marathon) ends with this share at race pace. */
    racePaceFinishShare: 0.3,
  },

  /** Max quality sessions per week by level (beginners: at most 1). */
  maxQualityPerWeek: { beginner: 1, intermediate: 2, advanced: 2 } satisfies PerLevel<number>,

  /** Fixed structure of quality sessions: warmup + main set + cooldown (km). */
  quality: {
    warmupKm: 2,
    cooldownKm: 1.5,
    tempo: { shareOfWeek: 0.1, minKm: 2, maxKm: 10 },
    racePace: {
      shareOfWeek: 0.12,
      minKm: 2,
      maxKm: { "5k": 4, "10k": 6, half: 12, marathon: 16 } satisfies PerDistance<number>,
    },
    intervals: {
      repKm: { "5k": 0.4, "10k": 1, half: 1, marathon: 1.6 } satisfies PerDistance<number>,
      shareOfWeek: 0.08,
      minReps: 4,
      maxReps: 10,
      recoverySeconds: 90,
      /** Jog distance per recovery, counted in the session total. */
      recoveryKm: 0.2,
    },
    taperMainSetFraction: 0.7,
  },

  strides: { reps: 6, repSeconds: 20, recoverySeconds: 60 },

  roundingKm: 0.5,
  minEasyRunKm: 3,
  /** Easy runs never exceed this fraction of the week's long run (excess volume is left out). */
  maxEasyFractionOfLong: 0.85,
  /** Race-week shakeouts may be shorter than a normal easy run. */
  raceWeekShakeoutMinKm: 2,
} as const;

/** Pace offsets in seconds/km relative to race pace (RP). */
export const PACES = {
  riegelExponent: 1.06,
  easyOffsetSecPerKm: [60, 90] as Range,
  longOffsetSecPerKm: [45, 75] as Range,
  /** Tempo/threshold ≈ equivalent pace between these two distances (km). */
  tempoEquivalentKm: [15, 10] as Range,
  intervalsEquivalentKm: 5,
  /** Finish goals: estimate paces from recent runs at least this long, within this many days. */
  estimateFromActivities: { minKm: 3, lookbackDays: 42 },
} as const;

/** RPE-based guidance used on every session (and instead of paces for finish goals). */
export const EFFORT_DESCRIPTIONS = {
  easy: "Easy, conversational — RPE 3–4",
  long: "Steady and relaxed; you could still talk in sentences — RPE 4–5",
  long_race_pace_finish: "Relaxed, then the last part at goal race effort — RPE 4–5, finishing at 6–7",
  tempo: "Comfortably hard; a few words at a time — RPE 6–7",
  intervals: "Hard but controlled, even reps — RPE 8",
  race_pace: "Goal race effort — RPE 6–7 (5K/10K: 7–8)",
  strides: "Easy run with short relaxed accelerations — RPE 3–4, strides at 7",
  race: "Race day — trust your training",
  rest: "Rest",
} as const;

export const SESSION_TYPES = [
  "easy",
  "long",
  "tempo",
  "intervals",
  "race_pace",
  "strides",
  "race",
  "rest",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const METRICS = {
  acuteDays: 7,
  chronicDays: 28,
  acwr: { high: 1.5, low: 0.8 },
  predictionLookbackWeeks: 6,
  /** RPE used for sRPE load when the user hasn't logged one and HR can't estimate it. */
  defaultRpeBySessionType: {
    easy: 3,
    long: 4,
    tempo: 6,
    intervals: 7,
    race_pace: 6,
    strides: 4,
    race: 9,
    rest: 0,
  } satisfies Readonly<Record<SessionType, number>>,
  defaultRpeUnplanned: 4,
  /** HR-based RPE estimate: [fraction of heart-rate reserve, RPE] points, linearly interpolated. */
  rpeFromHrr: [
    [0.4, 2],
    [0.5, 3],
    [0.6, 4],
    [0.7, 5],
    [0.8, 7],
    [0.9, 8],
    [0.95, 9],
    [1.0, 10],
  ] as readonly (readonly [number, number])[],
  /** Karvonen zone lower bounds as fractions of heart-rate reserve (Z1…Z5); Z5 tops out at max HR. */
  hrZoneBounds: [0.5, 0.6, 0.7, 0.8, 0.9] as readonly number[],
  /** HR samples further apart than this don't extend time-in-zone beyond it (s). */
  hrMaxSampleGapSeconds: 300,
  prediction: { minKm: 3, minFractionOfGoal: 0.25, hardRpe: 7, hardHrr: 0.8 },
} as const;

export const ADAPTATION = {
  compliance: { threshold: 0.7, consecutiveWeeks: 2 },
  acwr: { threshold: 1.5, nextWeekVolumeFraction: 0.85, removeQualitySessions: 1 },
  inactivity: { gapDays: 7, stepBackWeeks: [1, 2] as Range },
  fasterThanTarget: { minFasterFraction: 0.03, consecutiveSessions: 3 },
} as const;

export const IMPORT = {
  /** Our own limit, below Vercel's 4.5 MB request body cap, so we can answer 413 with a hint. */
  maxPayloadBytes: 4_000_000,
  rateLimit: { windowSeconds: 600, maxRequests: 30 },
  runningWorkoutPattern: /run/i,
  tokenPrefix: "rtt_",
  tokenRandomBytes: 32,
} as const;

export const CRON = {
  /** A user's week counts as closed once it's past this local hour on their weekStart day. */
  weekCloseHourLocal: 3,
  concurrency: 5,
} as const;

export const USER_DEFAULTS = {
  timezone: "Europe/Madrid",
  units: "km",
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekStart: 1,
  runDays: [2, 4, 6, 7],
  longRunDay: 7,
  maxRunsPerWeek: 4,
} as const;
