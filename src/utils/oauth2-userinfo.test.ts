import { describe, it, expect } from "vitest";
import { parseUserinfoEmail } from "./oauth2-userinfo";

describe("parseUserinfoEmail", () => {
  it("reads the email field", () => {
    expect(parseUserinfoEmail({ email: "me@spotwise.ai" })).toBe(
      "me@spotwise.ai",
    );
  });

  it("trims whitespace", () => {
    expect(parseUserinfoEmail({ email: "  me@spotwise.ai  " })).toBe(
      "me@spotwise.ai",
    );
  });

  it("falls back to preferredUsername then user", () => {
    expect(parseUserinfoEmail({ preferredUsername: "me@x.ai" })).toBe(
      "me@x.ai",
    );
    expect(parseUserinfoEmail({ user: "me@x.ai" })).toBe("me@x.ai");
    // email wins over the others
    expect(
      parseUserinfoEmail({ email: "a@x.ai", preferredUsername: "b@x.ai" }),
    ).toBe("a@x.ai");
  });

  it("returns null for non-object / empty / non-string values", () => {
    expect(parseUserinfoEmail(null)).toBeNull();
    expect(parseUserinfoEmail("nope")).toBeNull();
    expect(parseUserinfoEmail(undefined)).toBeNull();
    expect(parseUserinfoEmail({})).toBeNull();
    expect(parseUserinfoEmail({ email: "" })).toBeNull();
    expect(parseUserinfoEmail({ email: 123 })).toBeNull();
  });
});
