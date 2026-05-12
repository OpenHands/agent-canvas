import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import SettingsService from "#/api/settings-service/settings-service.api";
import { APP_PREFERENCES_STORAGE_KEY } from "#/api/app-preferences-store";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { server } from "#/mocks/node";
import { resetTestHandlersMockSettings } from "#/mocks/settings-handlers";
import type { Settings } from "#/types/settings";

const mockSaveCloudSettings = vi.fn();
const mockFetchCloudSettings = vi.fn();

vi.mock("#/api/cloud/settings-service.api", () => ({
  saveCloudSettings: (args: unknown) => mockSaveCloudSettings(args),
  fetchCloudSettings: () => mockFetchCloudSettings(),
  fetchCloudSettingsSchema: vi.fn(),
  fetchCloudConversationSettingsSchema: vi.fn(),
}));

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

describe("SettingsService", () => {
  beforeEach(() => {
    // Clear localStorage and reset mock settings state
    window.localStorage.clear();
    resetTestHandlersMockSettings();
    __resetActiveStoreForTests();
    mockSaveCloudSettings.mockReset().mockResolvedValue(undefined);
    mockFetchCloudSettings.mockReset();
    // Invalidate the in-memory cache
    SettingsService.invalidateCache();
  });

  afterEach(() => {
    __resetActiveStoreForTests();
  });

  it("fetches settings from the API and normalizes derived fields", async () => {
    // The mock handler returns default settings
    const settings = await SettingsService.getSettings();

    // Should have normalized settings with derived fields
    expect(settings.agent).toBe("CodeActAgent");
    expect(settings.llm_model).toBe("openhands/claude-opus-4-5-20251101");
    expect(settings.confirmation_mode).toBe(false);
    expect(settings.security_analyzer).toBe("llm");
  });

  it("saves settings via PATCH API and invalidates cache", async () => {
    // Save some settings
    await SettingsService.saveSettings({
      agent_settings_diff: {
        agent: "CodeActAgent",
        llm: {
          model: "saved-model",
          base_url: "https://saved.example.com",
          api_key: "saved-key",
        },
      },
      conversation_settings_diff: {
        confirmation_mode: true,
        security_analyzer: "llm",
        max_iterations: 33,
      },
    });

    // Fetch settings again - should reflect the saved values
    const settings = await SettingsService.getSettings();

    expect(settings.llm_model).toBe("saved-model");
    expect(settings.llm_base_url).toBe("https://saved.example.com");
    // Note: api_key will be redacted when fetched without X-Expose-Secrets header
    expect(settings.confirmation_mode).toBe(true);
    expect(settings.security_analyzer).toBe("llm");
    expect(settings.max_iterations).toBe(33);
  });

  it("returns encrypted secrets when using getSettingsForConversation", async () => {
    // First save a key
    await SettingsService.saveSettings({
      agent_settings_diff: {
        llm: {
          api_key: "test-api-key",
        },
      },
    });

    // Get settings for conversation (should have encrypted secrets)
    const { agentSettings, secretsEncrypted } =
      await SettingsService.getSettingsForConversation();

    expect(secretsEncrypted).toBe(true);
    // The mock returns an "encrypted" placeholder for the key
    const llm = agentSettings.llm as Record<string, unknown> | undefined;
    expect(llm?.api_key).toMatch(/^gAAAAA_mock_encrypted_/);
  });

  it("uses cache for repeated getSettings calls", async () => {
    const fetchSpy = vi.spyOn(SettingsService, "fetchSettingsFromApi");

    // First call - should fetch from API
    await SettingsService.getSettings();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    await SettingsService.getSettings();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // After invalidation - should fetch again
    SettingsService.invalidateCache();
    await SettingsService.getSettings();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockRestore();
  });

  it("skips API call when no diffs are provided to saveSettings", async () => {
    const fetchSpy = vi.spyOn(SettingsService, "fetchSettingsFromApi");

    // Call with empty/no diffs
    const result = await SettingsService.saveSettings({});

    expect(result).toBe(true);
    // No fetch should have been made (PATCH not called)
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("skips PATCH for a skills-only save against a local backend", async () => {
    // Arrange: skills are a cloud-only feature. The local agent-server's
    // PATCH /api/settings rejects payloads without agent/conversation diffs
    // (the MSW handler returns 400 in that case), so a successful no-op here
    // also confirms disabled_skills is not leaked to the local backend.
    const fetchSpy = vi.spyOn(SettingsService, "fetchSettingsFromApi");

    // Act
    const result = await SettingsService.saveSettings({
      disabled_skills: ["SSH Microagent"],
    });

    // Assert: returns true and never fires the PATCH (no fetch invalidation
    // either, because the cache wasn't cleared).
    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("persists app-level preferences to localStorage when saving on a local backend", async () => {
    // Arrange: no diffs, only the 5 app-level preference fields.
    const appPrefs = {
      language: "fr",
      git_user_name: "Alice",
      git_user_email: "alice@example.com",
      enable_sound_notifications: true,
      user_consents_to_analytics: true,
    };

    // Act
    await SettingsService.saveSettings(appPrefs);

    // Assert: localStorage holds the saved fields under the dedicated key.
    const raw = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
    expect(raw && JSON.parse(raw)).toEqual(appPrefs);
  });

  it("surfaces stored app-level preferences in getSettings on a local backend", async () => {
    // Arrange: pre-seed localStorage as if a previous save had persisted them.
    const appPrefs = {
      language: "fr",
      git_user_name: "Alice",
      git_user_email: "alice@example.com",
      enable_sound_notifications: true,
      user_consents_to_analytics: true,
    };
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify(appPrefs),
    );

    // Act
    const settings = await SettingsService.getSettings();

    // Assert: each stored field is reflected on the returned Settings.
    expect({
      language: settings.language,
      git_user_name: settings.git_user_name,
      git_user_email: settings.git_user_email,
      enable_sound_notifications: settings.enable_sound_notifications,
      user_consents_to_analytics: settings.user_consents_to_analytics,
    }).toEqual(appPrefs);
  });

  it("excludes app-level fields from the local PATCH body when mixed with diffs", async () => {
    // Arrange: capture the PATCH body the local agent-server would receive.
    // The handler must echo a valid response so saveSettings does not throw.
    // Use "*" prefix to match both relative paths and absolute URLs (e.g.,
    // http://127.0.0.1:8000/api/...) when VITE_BACKEND_BASE_URL is configured.
    const patchBodies: Array<Record<string, unknown>> = [];
    server.use(
      http.patch("*/api/settings", async ({ request }) => {
        patchBodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          agent_settings: {},
          conversation_settings: {},
          llm_api_key_is_set: false,
        });
      }),
    );

    // Act: send both an agent diff and an app-level field in the same save.
    await SettingsService.saveSettings({
      git_user_name: "Alice",
      agent_settings_diff: { agent: "CodeActAgent" },
    });

    // Assert: the local backend only sees the diff; the app field is
    // confined to localStorage.
    expect(patchBodies).toEqual([
      { agent_settings_diff: { agent: "CodeActAgent" } },
    ]);
    expect(
      JSON.parse(
        window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY) ?? "{}",
      ),
    ).toEqual({ git_user_name: "Alice" });
  });

  it("forwards app-level preferences as flat top-level fields to the cloud save", async () => {
    // Arrange: switch the active backend to cloud so saveSettings routes
    // through saveCloudSettings (mocked).
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    // Act
    await SettingsService.saveSettings({
      language: "fr",
      git_user_name: "Alice",
    });

    // Assert: cloud save received the fields under `app_preferences` so
    // `saveCloudSettings` can spread them into the POST body as flat keys.
    expect(mockSaveCloudSettings).toHaveBeenCalledWith({
      app_preferences: { language: "fr", git_user_name: "Alice" },
    });
  });

  it("ignores any stale localStorage git-provider-tokens key (PAT layer removed)", async () => {
    // Arrange: a previous version of the app may have written PATs to
    // localStorage under this key. After removing the integrations page and
    // the PAT layer, getSettings must not resurrect those stale tokens into
    // provider_tokens_set — that would re-enable the removed flow.
    window.localStorage.setItem(
      "openhands-agent-server-git-provider-tokens",
      JSON.stringify({
        github: { token: "ghp_stale_xyz", host: "github.com" },
        gitlab: { token: "glpat_stale_xyz", host: null },
      }),
    );

    // Act
    const settings = await SettingsService.getSettings();

    // Assert
    expect(settings.provider_tokens_set).toEqual({});
  });

  it("pre-clears mcp_config before writing the new value on the local backend", async () => {
    // The agent-server PATCH applies agent_settings_diff via deep-merge,
    // which cannot remove name-keyed entries from mcp_config.mcpServers.
    // saveSettings must compensate by sending a {mcp_config: null} PATCH
    // first so the follow-up PATCH effectively replaces the field. Without
    // this, deleting a server leaves stale mcpServers keys behind and
    // shifted indices produce duplicate entries.
    const patchBodies: Array<Record<string, unknown>> = [];
    server.use(
      http.patch("*/api/settings", async ({ request }) => {
        patchBodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          agent_settings: {},
          conversation_settings: {},
          llm_api_key_is_set: false,
        });
      }),
    );

    await SettingsService.saveSettings({
      agent_settings_diff: {
        mcp_config: { mcpServers: { only: { url: "https://x.example" } } },
      },
    });

    expect(patchBodies).toEqual([
      { agent_settings_diff: { mcp_config: null } },
      {
        agent_settings_diff: {
          mcp_config: { mcpServers: { only: { url: "https://x.example" } } },
        },
      },
    ]);
  });

  it("does not pre-clear when the mcp_config diff is already null on the local backend", async () => {
    // When the caller is wiping mcp_config entirely (e.g. user removed the
    // last server), a single PATCH already takes effect because null is
    // not a dict and deep-merge replaces rather than recurses. A second
    // clear would be wasted work.
    const patchBodies: Array<Record<string, unknown>> = [];
    server.use(
      http.patch("*/api/settings", async ({ request }) => {
        patchBodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          agent_settings: {},
          conversation_settings: {},
          llm_api_key_is_set: false,
        });
      }),
    );

    await SettingsService.saveSettings({
      agent_settings_diff: { mcp_config: null },
    });

    expect(patchBodies).toEqual([
      { agent_settings_diff: { mcp_config: null } },
    ]);
  });

  it("does not pre-clear when the diff has no mcp_config on the local backend", async () => {
    // A typical settings save (LLM model, condenser, …) must NOT incur the
    // mcp_config pre-clear round-trip — that would needlessly drop the
    // user's MCP servers if anything ever raced.
    const patchBodies: Array<Record<string, unknown>> = [];
    server.use(
      http.patch("*/api/settings", async ({ request }) => {
        patchBodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          agent_settings: {},
          conversation_settings: {},
          llm_api_key_is_set: false,
        });
      }),
    );

    await SettingsService.saveSettings({
      agent_settings_diff: { agent: "CodeActAgent" },
    });

    expect(patchBodies).toEqual([
      { agent_settings_diff: { agent: "CodeActAgent" } },
    ]);
  });

  it("pre-clears mcp_config on the cloud backend before writing the new value", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    await SettingsService.saveSettings({
      agent_settings_diff: {
        mcp_config: { mcpServers: { only: { url: "https://x.example" } } },
      },
    });

    expect(mockSaveCloudSettings).toHaveBeenCalledTimes(2);
    expect(mockSaveCloudSettings).toHaveBeenNthCalledWith(1, {
      agent_settings_diff: { mcp_config: null },
    });
    expect(mockSaveCloudSettings).toHaveBeenNthCalledWith(2, {
      agent_settings_diff: {
        mcp_config: { mcpServers: { only: { url: "https://x.example" } } },
      },
    });
  });

  it("rolls back to the previous mcp_config when the second cloud PATCH fails", async () => {
    // Reviewer-flagged data-loss scenario: the pre-clear succeeds, then
    // the write fails (validation error, transient outage, etc.). The
    // service must attempt to restore the previous mcp_config so the
    // user isn't silently left with an empty MCP setup.
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    const previousMcpConfig = {
      mcpServers: { existing: { url: "https://old.example" } },
    };
    mockFetchCloudSettings.mockResolvedValue({
      agent_settings: { mcp_config: previousMcpConfig },
    });

    // Pre-clear succeeds, second write fails on all retries, rollback
    // succeeds. withRetry runs three attempts by default — return the
    // failure deterministically so the rollback path is exercised.
    mockSaveCloudSettings.mockImplementation(
      (args: { agent_settings_diff?: { mcp_config?: unknown } }) => {
        const mcp = args?.agent_settings_diff?.mcp_config;
        if (mcp === null) return Promise.resolve(undefined); // pre-clear
        // The full payload from the user contains the *new* mcp_config.
        // Distinguish it from the rollback (which writes the previous
        // value) by object identity on mcpServers.
        if (
          mcp &&
          typeof mcp === "object" &&
          "mcpServers" in (mcp as Record<string, unknown>) &&
          (mcp as { mcpServers: Record<string, unknown> }).mcpServers.new
        ) {
          return Promise.reject(new Error("validation failed"));
        }
        return Promise.resolve(undefined); // rollback succeeds
      },
    );

    await expect(
      SettingsService.saveSettings({
        agent_settings_diff: {
          mcp_config: { mcpServers: { new: { url: "https://new.example" } } },
        },
      }),
    ).rejects.toThrow("validation failed");

    // 3 attempts for the failed write (default withRetry retries) +
    // 1 pre-clear + 1 rollback = 5 calls total. Last call MUST be the
    // rollback with the previous mcp_config.
    const lastCallArgs =
      mockSaveCloudSettings.mock.calls[
        mockSaveCloudSettings.mock.calls.length - 1
      ][0];
    expect(lastCallArgs).toEqual({
      agent_settings_diff: { mcp_config: previousMcpConfig },
    });
  });

  it("rolls back to the previous mcp_config when the second local PATCH fails", async () => {
    // Same scenario as the cloud test but for the local agent-server
    // path. We assert the rollback PATCH is the final request observed.
    const patchBodies: Array<Record<string, unknown>> = [];
    const previousMcpServers = {
      existing: { url: "https://old.example" },
    };
    let getCount = 0;
    server.use(
      http.get("*/api/settings", () => {
        getCount += 1;
        return HttpResponse.json({
          agent_settings: { mcp_config: { mcpServers: previousMcpServers } },
          conversation_settings: {},
          llm_api_key_is_set: false,
        });
      }),
      http.patch("*/api/settings", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patchBodies.push(body);
        const agentDiff = body.agent_settings_diff as
          | { mcp_config?: unknown }
          | undefined;
        const mcp = agentDiff?.mcp_config;
        // Pre-clear (mcp_config: null) and rollback (mcp_config: previous)
        // both succeed; only the "new" write fails.
        if (
          mcp &&
          typeof mcp === "object" &&
          "mcpServers" in (mcp as Record<string, unknown>) &&
          (mcp as { mcpServers: Record<string, unknown> }).mcpServers.new
        ) {
          return HttpResponse.json(
            { error: "validation failed" },
            { status: 400 },
          );
        }
        return HttpResponse.json({
          agent_settings: {},
          conversation_settings: {},
          llm_api_key_is_set: false,
        });
      }),
    );

    await expect(
      SettingsService.saveSettings({
        agent_settings_diff: {
          mcp_config: { mcpServers: { new: { url: "https://new.example" } } },
        },
      }),
    ).rejects.toBeDefined();

    // Snapshot fetch must have happened before any destructive PATCH.
    expect(getCount).toBeGreaterThanOrEqual(1);

    // Final PATCH is the rollback, restoring the previous mcp_config.
    const last = patchBodies[patchBodies.length - 1];
    expect(last).toEqual({
      agent_settings_diff: { mcp_config: { mcpServers: previousMcpServers } },
    });
    // And we must have done the pre-clear too.
    expect(patchBodies[0]).toEqual({
      agent_settings_diff: { mcp_config: null },
    });
  });

  it("does not attempt rollback when the snapshot fetch returned no mcp_config", async () => {
    // First-time install: there's nothing to roll back to. The original
    // error must still propagate but we must not send a bogus rollback
    // PATCH (e.g. `mcp_config: undefined`) that the backend would reject.
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    mockFetchCloudSettings.mockResolvedValue({ agent_settings: {} });
    mockSaveCloudSettings.mockImplementation(
      (args: { agent_settings_diff?: { mcp_config?: unknown } }) => {
        if (args?.agent_settings_diff?.mcp_config === null) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error("validation failed"));
      },
    );

    await expect(
      SettingsService.saveSettings({
        agent_settings_diff: {
          mcp_config: { mcpServers: { new: { url: "https://new.example" } } },
        },
      }),
    ).rejects.toThrow("validation failed");

    // 1 pre-clear + 3 failed write attempts = 4 calls. No rollback
    // attempt because the snapshot was empty. Critically, we never
    // send `mcp_config: undefined` as a "rollback" since that would
    // be backend-rejected or, worse, silently no-op.
    expect(mockSaveCloudSettings).toHaveBeenCalledTimes(4);
    const sentMcpValues = mockSaveCloudSettings.mock.calls.map(
      (call) =>
        (call[0] as { agent_settings_diff?: { mcp_config?: unknown } })
          ?.agent_settings_diff?.mcp_config,
    );
    // Every call's mcp_config is either the pre-clear null or the
    // exact new value the caller asked us to write — no implicit
    // rollback target leaked through.
    for (const mcp of sentMcpValues) {
      const isPreClear = mcp === null;
      const isNewWrite =
        !!mcp &&
        typeof mcp === "object" &&
        "mcpServers" in (mcp as Record<string, unknown>) &&
        !!(mcp as { mcpServers: Record<string, unknown> }).mcpServers.new;
      expect(isPreClear || isNewWrite).toBe(true);
    }
  });

  it("lets the cloud response override locally-stored app preferences", async () => {
    // Arrange: localStorage holds a stale "fr" while the cloud is the
    // authoritative source and returns "ja".
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ language: "fr" }),
    );
    mockFetchCloudSettings.mockResolvedValue({
      language: "ja",
    } as Partial<Settings>);

    // Act
    const settings = await SettingsService.getSettings();

    // Assert: the server wins.
    expect(settings.language).toBe("ja");
  });
});
