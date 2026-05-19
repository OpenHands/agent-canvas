import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientLoader } from "#/routes/mcp";
import SettingsService from "#/api/settings-service/settings-service.api";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { queryClient } from "#/query-client-config";

describe("mcp route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    __resetActiveStoreForTests();
    queryClient.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
    queryClient.clear();
  });

  it("redirects to /settings/agent when the active agent is ACP", async () => {
    // The SDK's ``ACPAgent`` rejects ``mcp_config`` on init, so the
    // /mcp editor would silently no-op against the running ACP
    // subprocess. The clientLoader bounces the user to the Agent
    // settings page (same UX as /settings, /settings/condenser).
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...MOCK_DEFAULT_USER_SETTINGS,
      agent_settings: {
        ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
        agent_kind: "acp",
        acp_server: "claude-code",
      },
    });

    const response = (await clientLoader()) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/settings/agent");
  });

  it("does not redirect when the active agent is OpenHands", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...MOCK_DEFAULT_USER_SETTINGS,
      agent_settings: {
        ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
        agent_kind: "openhands",
      },
    });

    const result = await clientLoader();

    expect(result).toBeNull();
  });

  it("falls through when settings can't be fetched (no redirect-loop on errors)", async () => {
    // ``redirectIfAcpActive`` swallows errors and returns ``null`` so a
    // transient settings-fetch failure (unauthed, offline, agent-server
    // not running) doesn't trap the user on a permanent redirect.
    vi.spyOn(SettingsService, "getSettings").mockRejectedValue(
      new Error("network down"),
    );

    const result = await clientLoader();

    expect(result).toBeNull();
  });
});
