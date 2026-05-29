import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import {
  writeStoredActiveBackend,
  writeStoredBackends,
} from "#/api/backend-registry/storage";
import i18n, { OPENHANDS_I18N_NAMESPACE } from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import {
  AgentServerUnavailableError,
  clearCachedAgentServerInfo,
  isAgentServerToolAvailable,
} from "#/api/agent-server-compatibility";
import OptionService from "#/api/option-service/option-service.api";
import { server } from "#/mocks/node";

const TEST_BACKEND = {
  id: "test-local-backend",
  name: "Test local backend",
  host: "http://127.0.0.1:8000",
  apiKey: "",
  kind: "local" as const,
};

describe("OptionService", () => {
  beforeEach(() => {
    clearCachedAgentServerInfo();
    window.localStorage.clear();
    writeStoredBackends([TEST_BACKEND]);
    writeStoredActiveBackend({ backendId: TEST_BACKEND.id });
    __resetActiveStoreForTests();
    i18n.addResourceBundle(
      "en",
      OPENHANDS_I18N_NAMESPACE,
      {
        [I18nKey.ERROR$AGENT_SERVER_CORS]:
          "Restart `agent-server` with `OH_ALLOW_CORS_ORIGINS='[\"{{frontendOrigin}}\"]'`.",
      },
      true,
      true,
    );
    i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  it("returns config in mock mode without a live backend", async () => {
    vi.stubEnv("VITE_MOCK_API", "true");
    window.localStorage.clear();
    __resetActiveStoreForTests();

    const config = await OptionService.getConfig();

    expect(config.feature_flags.hide_llm_settings).toBe(false);
    expect(config.feature_flags.hide_users_page).toBe(true);
    expect(config.updated_at).toBeTruthy();
  });

  it("loads config regardless of agent server version", async () => {
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.0.0" }),
      ),
    );

    await expect(OptionService.getConfig()).resolves.toMatchObject({
      feature_flags: expect.objectContaining({ hide_llm_settings: false }),
    });
  });

  it("loads config even when the server does not advertise a version", async () => {
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0 }),
      ),
    );

    await expect(OptionService.getConfig()).resolves.toMatchObject({
      feature_flags: expect.objectContaining({ hide_llm_settings: false }),
    });
  });

  it("throws an unavailable error when the agent server cannot be reached", async () => {
    server.use(http.get("*/server_info", () => HttpResponse.error()));

    await expect(OptionService.getConfig()).rejects.toMatchObject({
      name: AgentServerUnavailableError.name,
      message: expect.stringContaining("Agent server not found"),
      details: expect.stringContaining("OH_ALLOW_CORS_ORIGINS"),
      reason: "unreachable",
    });
  });

  it("throws an unavailable error when the agent server rejects the session key", async () => {
    server.use(
      http.get("*/server_info", () => new HttpResponse(null, { status: 401 })),
    );

    await expect(OptionService.getConfig()).rejects.toMatchObject({
      name: AgentServerUnavailableError.name,
      message: expect.stringContaining("Agent server not found"),
      reason: "unauthorized",
      status: 401,
    });
  });

  it("throws an unavailable error when protected API auth fails after server_info succeeds", async () => {
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.24.0" }),
      ),
      http.get("*/api/settings", () => new HttpResponse(null, { status: 401 })),
    );

    await expect(OptionService.getConfig()).rejects.toMatchObject({
      name: AgentServerUnavailableError.name,
      message: expect.stringContaining("Agent server not found"),
      reason: "unauthorized",
      status: 401,
    });
  });

  it("caches usable_tools from server_info for later tool gating", async () => {
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({
          uptime: 0,
          idle_time: 0,
          version: "1.21.1",
          usable_tools: ["terminal", "file_editor", "task_tracker"],
        }),
      ),
    );

    await OptionService.getConfig();

    expect(isAgentServerToolAvailable("browser_tool_set")).toBe(false);
    expect(isAgentServerToolAvailable("terminal")).toBe(true);
  });

  it("allows all tools when the server does not advertise tool metadata", async () => {
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({
          uptime: 0,
          idle_time: 0,
          version: "1.21.1",
        }),
      ),
    );

    await OptionService.getConfig();

    expect(isAgentServerToolAvailable("browser_tool_set")).toBe(true);
    expect(isAgentServerToolAvailable("terminal")).toBe(true);
  });

  it("returns models from mocked LLM endpoints", async () => {
    const models = await OptionService.getModels();

    expect(models.models).toContain("openhands/claude-opus-4-5-20251101");
    expect(models.verified_models).toContain("claude-opus-4-5-20251101");
    expect(models.verified_providers).toEqual(["anthropic", "openhands"]);
    expect(models.default_model).toBeTruthy();
  });
});
