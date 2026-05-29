import { describe, expect, it } from "vitest";
import { QUERY_KEYS, SETTINGS_QUERY_KEYS } from "./query-keys";

describe("QUERY_KEYS", () => {
  it("builds backend-scoped web client config keys", () => {
    expect(
      QUERY_KEYS.WEB_CLIENT_CONFIG_BY_BACKEND({
        id: "local-1",
        kind: "local",
        host: "http://localhost:8000",
        apiKey: "session-key",
      }),
    ).toEqual([
      "web-client-config",
      "local-1",
      "local",
      "http://localhost:8000",
      "session-key",
    ]);
  });
});

describe("SETTINGS_QUERY_KEYS", () => {
  it("returns the canonical root settings key", () => {
    expect(SETTINGS_QUERY_KEYS.all).toEqual(["settings"]);
  });

  it("builds scoped settings keys", () => {
    expect(SETTINGS_QUERY_KEYS.byScope("personal")).toEqual([
      "settings",
      "personal",
    ]);
  });

  it("builds the canonical personal settings key", () => {
    expect(SETTINGS_QUERY_KEYS.personal()).toEqual(["settings", "personal"]);
    expect(SETTINGS_QUERY_KEYS.personal()).toEqual(
      SETTINGS_QUERY_KEYS.byScope("personal"),
    );
  });
});
