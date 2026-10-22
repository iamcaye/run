export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

export function isShareToken(v: unknown): v is string {
  return typeof v === "string" && SHARE_TOKEN_RE.test(v);
}

export const sharePath = (token: string) => `/p/${token}`;
export const followPath = (token: string) => `/p/${token}/follow`;

const FOLLOW_RE = /^\/p\/([A-Za-z0-9_-]{22})\/follow$/;

/** Only `/p/<token>/follow` (the one post-auth destination we hand out); anything else → null. */
export function safeNextPath(raw: unknown): string | null {
  return typeof raw === "string" && FOLLOW_RE.test(raw) ? raw : null;
}
