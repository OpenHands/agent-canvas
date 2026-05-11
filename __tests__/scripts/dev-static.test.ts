import { describe, expect, it } from "vitest";
import { parseArgs } from "../../scripts/dev-static.mjs";

describe("dev-static CLI", () => {
  it("remote mode requires browser session-key entry", () => {
    expect(parseArgs(["--remote"])).toMatchObject({
      remote: true,
      requireBrowserSessionKey: true,
    });
  });

  it("can require browser session-key entry without changing bind mode", () => {
    expect(parseArgs(["--require-browser-session-key"])).toMatchObject({
      remote: false,
      requireBrowserSessionKey: true,
    });
  });

  it("can require browser session-key entry through the environment", () => {
    expect(
      parseArgs([], { OH_REQUIRE_BROWSER_SESSION_KEY: "true" }),
    ).toMatchObject({
      remote: false,
      requireBrowserSessionKey: true,
    });
  });
});
