import axios from "axios";
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
  vi.mocked(axios.post).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("cloud settings via local proxy", () => {
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

    // Outer hop must be local proxy.
    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "GET",
      path: "/api/v1/settings",
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

    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "POST",
      path: "/api/v1/settings",
    });
    const proxiedBody = (body as { body: Record<string, unknown> }).body;
    expect(proxiedBody).toEqual({
      agent_settings_diff: agentDiff,
      conversation_settings_diff: conversationDiff,
    });
    expect(proxiedBody).not.toHaveProperty("agent_settings");
    expect(proxiedBody).not.toHaveProperty("conversation_settings");
  });

  it("SettingsService.saveSettings forwards disabled_skills to the cloud proxy when active backend is cloud", async () => {
    // Arrange: cloud backend already active via beforeEach; mock proxy response.
    vi.mocked(axios.post).mockResolvedValue({ data: {} });

    // Act: save a skills-only update — previously this short-circuited and
    // sent nothing at all, leaving the toggle un-persisted.
    await SettingsService.saveSettings({
      disabled_skills: ["SSH Microagent"],
    });

    // Assert: a single proxied POST /api/v1/settings reached the wire with
    // disabled_skills as a top-level field on the upstream body.
    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    const [, envelope] = vi.mocked(axios.post).mock.calls[0]!;
    expect(envelope).toMatchObject({
      method: "POST",
      path: "/api/v1/settings",
    });
    expect((envelope as { body: Record<string, unknown> }).body).toEqual({
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

    const [, body] = vi.mocked(axios.post).mock.calls[0]!;
    const proxiedBody = (body as { body: Record<string, unknown> }).body;
    expect(proxiedBody).toEqual({
      agent_settings_diff: {
        llm: { model: "anthropic/claude-sonnet-4-20250514" },
      },
    });
  });
});
