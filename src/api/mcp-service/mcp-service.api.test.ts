import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCPClient } from "@openhands/typescript-client/clients";
import {
  setActiveSelection,
  setRegisteredBackends,
} from "../backend-registry/active-store";
import SettingsService from "../settings-service/settings-service.api";
import McpService from "./mcp-service.api";
import { REDACTED_MCP_SECRET_VALUE } from "#/utils/mcp-config";

vi.mock("@openhands/typescript-client/clients", () => ({
  MCPClient: vi.fn(),
}));

const testServer = vi.fn();
const close = vi.fn();

const encryptedAuth = "gAAAAAencrypted-auth";

describe("McpService.testServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRegisteredBackends([
      {
        id: "local",
        name: "Local",
        host: "http://127.0.0.1:8001",
        apiKey: "session-key",
        kind: "local",
      },
    ]);
    setActiveSelection({ backendId: "local", orgId: null });
    vi.mocked(MCPClient).mockImplementation(function MockMCPClient() {
      return {
        testServer,
        close,
      } as unknown as MCPClient;
    } as unknown as typeof MCPClient);
    testServer.mockResolvedValue({ ok: true, tools: [] });
  });

  it("tests stored remote MCP credentials as encrypted auth, not redacted text", async () => {
    vi.spyOn(SettingsService, "fetchSettingsFromApi").mockResolvedValue({
      llm_api_key_is_set: false,
      conversation_settings: {},
      agent_settings: {
        mcp_config: {
          linear: {
            url: "https://mcp.linear.app/mcp",
            transport: "http",
            auth: { strategy: "bearer", value: encryptedAuth },
          },
        },
      },
    });

    await McpService.testServer({
      id: "shttp-0",
      type: "shttp",
      name: "linear",
      url: "https://mcp.linear.app/mcp",
      auth: { strategy: "bearer", value: REDACTED_MCP_SECRET_VALUE },
    });

    expect(SettingsService.fetchSettingsFromApi).toHaveBeenCalledWith(
      "encrypted",
    );
    expect(testServer).toHaveBeenCalledTimes(1);
    expect(testServer.mock.calls[0][0]).toMatchObject({
      name: "linear",
      server: {
        type: "shttp",
        url: "https://mcp.linear.app/mcp",
        auth: { strategy: "bearer", value: encryptedAuth },
      },
    });
    expect(testServer.mock.calls[0][0].server).not.toHaveProperty("api_key");
    expect(testServer.mock.calls[0][0].server).not.toHaveProperty("headers");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("forwards explicit OAuth authentication metadata to the MCP test endpoint", async () => {
    await McpService.testServer({
      id: "shttp-0",
      type: "shttp",
      name: "superhuman-mail",
      url: "https://mcp.mail.superhuman.com/mcp",
      auth: {
        strategy: "oauth2",
        authentication: {
          type: "oauth",
          client_auth_method: "none",
        },
        state: {
          tokens: {
            access_token: "gAAAAexisting-access-token",
          },
        },
      },
    });

    expect(testServer).toHaveBeenCalledTimes(1);
    expect(testServer.mock.calls[0][0]).toMatchObject({
      name: "superhuman-mail",
      server: {
        type: "shttp",
        url: "https://mcp.mail.superhuman.com/mcp",
        auth: {
          strategy: "oauth2",
          authentication: {
            type: "oauth",
            client_auth_method: "none",
          },
          state: {
            tokens: {
              access_token: "gAAAAexisting-access-token",
            },
          },
        },
      },
      timeout: 120,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("returns OAuth state captured by the MCP test endpoint", async () => {
    testServer.mockResolvedValueOnce({
      ok: true,
      tools: ["search_mail"],
      oauth_state: {
        tokens: {
          access_token: "gAAAAencrypted-access-token",
        },
        token_expires_at: 12345,
      },
    });

    const result = await McpService.testServer({
      id: "shttp-0",
      type: "shttp",
      name: "superhuman-mail",
      url: "https://mcp.mail.superhuman.com/mcp",
      auth: {
        strategy: "oauth2",
        authentication: {
          type: "oauth",
          client_auth_method: "none",
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected successful MCP test");
    expect(result.oauth_state).toMatchObject({
      tokens: {
        access_token: "gAAAAencrypted-access-token",
      },
      token_expires_at: 12345,
    });
  });
});
