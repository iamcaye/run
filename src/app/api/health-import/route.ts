import { IMPORT } from "@/config/training";
import { forUser } from "@/server/dal";
import { resolveBearerToken, touchToken } from "@/server/system/import-tokens";
import { hitRateLimit } from "@/server/system/rate-limit";
import { ingestPayload, recordRejected } from "@/services/health-import";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

const TOO_LARGE_HINT =
  `Payload exceeds ${IMPORT.maxPayloadBytes / 1_000_000} MB. In Health Auto Export, enable "Batch requests" ` +
  "for this automation (or shorten the date range) so each request stays small.";

/**
 * Health Auto Export → `POST /api/health-import` with `Authorization: Bearer <import token>`.
 * The token identifies the user; the raw payload is stored before workouts are parsed.
 */
export async function POST(request: Request): Promise<Response> {
  const token = await resolveBearerToken(request.headers.get("authorization"));
  if (!token) return json(401, { error: "invalid_token", message: "Missing, unknown or revoked import token." });

  const limit = await hitRateLimit(`import:${token.tokenId}`, IMPORT.rateLimit);
  if (!limit.allowed) {
    return json(
      429,
      { error: "rate_limited", message: "Too many imports with this token. Try again later." },
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  const scope = forUser(token.userId);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > IMPORT.maxPayloadBytes) {
    await recordRejected(scope, token.tokenId, declared, "Payload too large");
    return json(413, { error: "payload_too_large", message: TOO_LARGE_HINT, bytes: declared });
  }

  const body = await request.text();
  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > IMPORT.maxPayloadBytes) {
    await recordRejected(scope, token.tokenId, bytes, "Payload too large");
    return json(413, { error: "payload_too_large", message: TOO_LARGE_HINT, bytes });
  }

  const result = await ingestPayload(scope, token.tokenId, body, bytes);
  await touchToken(token.tokenId);

  if (result.status === "rejected") {
    return json(400, { error: "invalid_payload", message: result.error, rawImportId: result.rawImportId });
  }
  const { summary } = result;
  return json(200, {
    ok: true,
    rawImportId: summary.rawImportId,
    workouts: summary.workouts,
    imported: summary.imported,
    skipped: summary.skipped,
    invalid: summary.invalid,
    matched: summary.matched,
  });
}
