import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsService from "#/api/settings-service/settings-service.api";
import { resetTestHandlersMockSettings } from "#/mocks/settings-handlers";

describe("SettingsService", () => {
  beforeEach(() => {
    // Clear localStorage and reset mock settings state
    window.localStorage.clear();
    resetTestHandlersMockSettings();
    // Invalidate the in-memory cache
    SettingsService.invalidateCache();
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

  it("derives provider_tokens_set from locally stored git provider tokens", async () => {
    // Arrange: simulate post-save state. SecretsService.addGitProvider writes to
    // this localStorage key after the server PUT /api/settings/secrets succeeds.
    // The agent-server API never returns provider_tokens_set, so the GUI must
    // derive it from local state for useUserProviders / git-settings to recognize
    // the configured providers.
    window.localStorage.setItem(
      "openhands-agent-server-git-provider-tokens",
      JSON.stringify({
        github: { token: "ghp_test_123", host: "github.com" },
        gitlab: { token: "glpat_test_456", host: null },
      }),
    );

    // Act
    const settings = await SettingsService.getSettings();

    // Assert: each stored provider surfaces in provider_tokens_set with its host
    // (or null), which is what consumers like useUserProviders read.
    expect(settings.provider_tokens_set).toEqual({
      github: "github.com",
      gitlab: null,
    });
  });
});
