import axios from "axios";
import {
  capturedUpstreamRequest,
  resetCloudProxyMock,
} from "./_proxy-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import {
  fetchCloudSettings,
  saveCloudSettings,
} from "#/api/cloud/settings-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  resetCloudProxyMock();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("cloud settings", () => {
  it("fetchCloudSettings preserves provider_tokens_set so the repo chain can fire", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        llm_model: "anthropic/claude-3-5-sonnet",
        llm_base_url: "https://api.anthropic.com",
        llm_api_key_set: true,
        agent: "CodeActAgent",
        confirmation_mode: true,
        security_analyzer: "llm",
        max_iterations: 30,
        provider_tokens_set: { github: "***" },
      },
    });

    const result = await fetchCloudSettings();

    const config = capturedUpstreamRequest(0);
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/v1/settings`,
      method: "GET",
      headers: { Authorization: "Bearer bearer-token" },
    });

    // provider_tokens_set must round-trip — it's what drives
    // useUserProviders → useAppInstallations → useGitRepositories.
    expect(result.provider_tokens_set).toEqual({ github: "***" });

    // Top-level cloud fields are preserved as-is.
    expect(result.llm_model).toBe("anthropic/claude-3-5-sonnet");
    expect(result.llm_api_key_set).toBe(true);
    expect(result.agent).toBe("CodeActAgent");

    // Nested shape derived for the local-mode settings page.
    expect(result.agent_settings?.agent).toBe("CodeActAgent");
    expect(result.agent_settings?.llm).toEqual({
      model: "anthropic/claude-3-5-sonnet",
      base_url: "https://api.anthropic.com",
    });
    expect(result.conversation_settings?.confirmation_mode).toBe(true);
    expect(result.conversation_settings?.security_analyzer).toBe("llm");
    expect(result.conversation_settings?.max_iterations).toBe(30);
  });

  it("saveCloudSettings forwards diffs verbatim and omits the legacy keys the cloud rejects", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });

    const agentDiff = {
      llm: { model: "openai/gpt-4o", base_url: "https://api.openai.com" },
      agent: "CodeActAgent",
    };
    const conversationDiff = { max_iterations: 50 };

    await saveCloudSettings({
      agent_settings_diff: agentDiff,
      conversation_settings_diff: conversationDiff,
    });

    const config = capturedUpstreamRequest(0);
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/v1/settings`,
      method: "POST",
      headers: { Authorization: "Bearer bearer-token" },
    });
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({
      agent_settings_diff: agentDiff,
      conversation_settings_diff: conversationDiff,
    });
    expect(requestBody).not.toHaveProperty("agent_settings");
    expect(requestBody).not.toHaveProperty("conversation_settings");
  });

  it("SettingsService.saveSettings forwards disabled_skills to cloud when active backend is cloud", async () => {
    // Arrange: cloud backend already active via beforeEach; mock cloud response.
    vi.mocked(axios.post).mockResolvedValue({ data: {} });

    // Act: save a skills-only update — previously this short-circuited and
    // sent nothing at all, leaving the toggle un-persisted.
    await SettingsService.saveSettings({
      disabled_skills: ["SSH Microagent"],
    });

    // Assert: a single POST /api/v1/settings reached the wire with
    // disabled_skills as a top-level field.
    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    const config = capturedUpstreamRequest(0);
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/v1/settings`,
      method: "POST",
      headers: { Authorization: "Bearer bearer-token" },
    });
    expect((config as { data: Record<string, unknown> }).data).toEqual({
      disabled_skills: ["SSH Microagent"],
    });
  });

  it("saveCloudSettings omits an empty conversation_settings_diff (LLM-only save)", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });

    await saveCloudSettings({
      agent_settings_diff: {
        llm: { model: "anthropic/claude-sonnet-4-20250514" },
      },
      conversation_settings_diff: {},
    });

    const config = capturedUpstreamRequest(0);
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({
      agent_settings_diff: {
        llm: { model: "anthropic/claude-sonnet-4-20250514" },
      },
    });
  });
});

describe("saveCloudSettings drops agent_context: null (agent-canvas#981)", () => {
  it("strips a null agent_context while preserving sibling agent settings", async () => {
    // Arrange: the cloud rejects agent_context: null against OpenHandsAgentSettings.
    vi.mocked(axios.post).mockResolvedValue({ data: {} });

    // Act
    await saveCloudSettings({
      agent_settings_diff: {
        llm: { model: "anthropic/claude-sonnet-4-20250514" },
        agent_context: null,
      },
    });

    // Assert: agent_context never reaches the wire, but the real llm change does.
    const config = capturedUpstreamRequest(0);
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({
      agent_settings_diff: {
        llm: { model: "anthropic/claude-sonnet-4-20250514" },
      },
    });
  });

  it("preserves a null mcp_config so clearing MCP config still round-trips", async () => {
    // Arrange: mcp_config: null is an intentional "clear" signal, not an error.
    vi.mocked(axios.post).mockResolvedValue({ data: {} });

    // Act
    await saveCloudSettings({
      agent_settings_diff: { mcp_config: null },
    });

    // Assert: the null mcp_config must survive (don't over-strip nulls).
    const config = capturedUpstreamRequest(0);
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({ agent_settings_diff: { mcp_config: null } });
  });

  it("omits agent_settings_diff when agent_context: null is its only key", async () => {
    // Arrange
    vi.mocked(axios.post).mockResolvedValue({ data: {} });

    // Act
    await saveCloudSettings({
      agent_settings_diff: { agent_context: null },
    });

    // Assert: nothing is left to send, so no agent_settings_diff goes on the wire.
    const config = capturedUpstreamRequest(0);
    const requestBody = (config as { data: Record<string, unknown> }).data;
    expect(requestBody).toEqual({});
  });
});
