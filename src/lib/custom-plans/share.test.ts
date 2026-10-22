import { describe, expect, it } from "vitest";
import { followPath, isShareToken, safeNextPath, sharePath } from "./share";

const t = "abcdefghijklmnopqrstuv";

describe("share links", () => {
  it("accepts only 22-char base64url tokens", () => {
    expect(isShareToken(t)).toBe(true);
    expect(isShareToken("abc")).toBe(false);
    expect(isShareToken("abcdefghijklmnopqrst/v")).toBe(false);
    expect(isShareToken(42)).toBe(false);
  });
  it("builds paths", () => {
    expect(sharePath(t)).toBe(`/p/${t}`);
    expect(followPath(t)).toBe(`/p/${t}/follow`);
  });
  it("safeNextPath allows only follow paths", () => {
    expect(safeNextPath(`/p/${t}/follow`)).toBe(`/p/${t}/follow`);
    for (const bad of ["https://evil.com", "//evil.com", `/p/${t}/follow/../../x`, "/dashboard", `/p/${t}`, null, 42])
      expect(safeNextPath(bad)).toBeNull();
  });
});
