import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import {
  AgentServerUnavailableError,
  clearCachedAgentServerInfo,
  isAgentServerToolAvailable,
} from "#/api/agent-server-compatibility";
import OptionService from "#/api/option-service/option-service.api";
import { server } from "#/mocks/node";

describe("OptionService", () => {
  beforeEach(() => {
    clearCachedAgentServerInfo();
  });

  it("returns config in mock mode without a live backend", async () => {
    const config = await OptionService.getConfig();

    expect(config.feature_flags.hide_llm_settings).toBe(false);
    expect(config.feature_flags.hide_users_page).toBe(true);
    expect(config.updated_at).toBeTruthy();
  });

  it("loads config regardless of agent server version", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.0.0" }),
      ),
    );

    await expect(OptionService.getConfig()).resolves.toMatchObject({
      feature_flags: expect.objectContaining({ hide_llm_settings: false }),
    });
  });

  it("loads config even when the server does not advertise a version", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0 }),
      ),
    );

    await expect(OptionService.getConfig()).resolves.toMatchObject({
      feature_flags: expect.objectContaining({ hide_llm_settings: false }),
    });
  });

  it("throws an unavailable error when the agent server cannot be reached", async () => {
    server.use(http.get("/server_info", () => HttpResponse.error()));

    await expect(OptionService.getConfig()).rejects.toMatchObject({
      name: AgentServerUnavailableError.name,
      message: expect.stringContaining("Agent server not found"),
      details: expect.stringContaining("Request failed"),
    });
  });

  it("caches usable_tools from server_info for later tool gating", async () => {
    server.use(
      http.get("/server_info", () =>
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
      http.get("/server_info", () =>
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
