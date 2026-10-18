import "server-only";
import { mapWorkout, type MappedWorkout } from "@/lib/import/map-workout";
import { HaePayloadSchema } from "@/lib/import/schema";
import type { UserScope } from "@/server/dal";
import { linkToPlannedSession } from "./activity-linking";

export type ImportSummary = {
  rawImportId: string;
  workouts: number;
  imported: number;
  skipped: number;
  invalid: string[];
  matched: number;
};

export type IngestResult =
  | { status: "ok"; summary: ImportSummary }
  | { status: "rejected"; rawImportId: string; error: string };

/**
 * Entry point for one request body: persist it as received (before any parsing of workouts),
 * then process it. Invalid JSON can't go into a jsonb column, so it's recorded without a payload.
 */
export async function ingestPayload(
  scope: UserScope,
  tokenId: string,
  body: string,
  bytes: number,
): Promise<IngestResult> {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    const raw = await scope.rawImports.create({ tokenId, payloadBytes: bytes, payload: null, status: "failed", error: "Body is not valid JSON" });
    return { status: "rejected", rawImportId: raw.id, error: "Body is not valid JSON" };
  }
  const raw = await scope.rawImports.create({ tokenId, payloadBytes: bytes, payload: json });
  return processRawImport(scope, raw.id);
}

/** Records a payload we refused to store (too large). */
export async function recordRejected(scope: UserScope, tokenId: string, bytes: number, error: string): Promise<void> {
  await scope.rawImports.create({ tokenId, payloadBytes: bytes, payload: null, status: "failed", error });
}

/**
 * Maps and upserts every running workout of a stored payload. Idempotent: safe to run again on
 * the same raw import (that's what `pnpm reprocess` does).
 */
export async function processRawImport(scope: UserScope, rawImportId: string): Promise<IngestResult> {
  const raw = await scope.rawImports.get(rawImportId);
  if (!raw) throw new Error("Raw import not found");

  const fail = async (error: string): Promise<IngestResult> => {
    await scope.rawImports.markResult(raw.id, { status: "failed", error });
    return { status: "rejected", rawImportId: raw.id, error };
  };

  const envelope = HaePayloadSchema.safeParse(raw.payload);
  if (!envelope.success) return fail("Unexpected payload shape: expected { data: { workouts: [...] } }");

  try {
    const settings = await scope.settings.get();
    const summary: ImportSummary = {
      rawImportId: raw.id,
      workouts: envelope.data.data.workouts.length,
      imported: 0,
      skipped: 0,
      invalid: [],
      matched: 0,
    };

    for (const w of envelope.data.data.workouts) {
      const mapped = mapWorkout(w, { timeZone: settings.timezone });
      if (mapped.status === "skipped") summary.skipped++;
      else if (mapped.status === "invalid") summary.invalid.push(mapped.reason);
      else {
        const { matched } = await saveWorkout(scope, mapped.workout, raw.id, settings.timezone);
        summary.imported++;
        if (matched) summary.matched++;
      }
    }

    if (summary.imported === 0 && summary.invalid.length > 0) {
      return fail(`No workouts could be read: ${summary.invalid.join("; ")}`);
    }
    await scope.rawImports.markResult(raw.id, {
      status: "processed",
      error: summary.invalid.length > 0 ? `${summary.invalid.length} workout(s) skipped: ${summary.invalid.join("; ")}` : null,
    });
    return { status: "ok", summary };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Processing failed");
  }
}

async function saveWorkout(
  scope: UserScope,
  w: MappedWorkout,
  rawImportId: string,
  timeZone: string,
): Promise<{ matched: boolean }> {
  const activity = await scope.activities.upsert({
    externalId: w.externalId,
    source: "healthkit",
    startAt: w.startAt,
    km: w.km,
    seconds: w.seconds,
    avgHr: w.avgHr,
    maxHr: w.maxHr,
    rpe: null,
    hrSeries: w.hrSeries,
    plannedSessionId: null,
    rawImportId,
    notes: null,
  });
  // A re-send without a route (e.g. a trimmed export) never wipes the stored one.
  if (w.route.length > 0) {
    await scope.activities.replaceRoute(
      activity.id,
      w.route.map((p, idx) => ({ idx, lat: p.lat, lon: p.lon, altitude: p.altitude, timestamp: p.timestamp })),
    );
  }
  return { matched: await linkToPlannedSession(scope, activity, timeZone) };
}

/** Re-runs every stored payload of a user, oldest first. */
export async function reprocessUser(scope: UserScope): Promise<{ total: number; ok: number; failed: number }> {
  const ids = await scope.rawImports.listIds();
  let ok = 0;
  for (const id of ids) {
    const r = await processRawImport(scope, id);
    if (r.status === "ok") ok++;
  }
  return { total: ids.length, ok, failed: ids.length - ok };
}
