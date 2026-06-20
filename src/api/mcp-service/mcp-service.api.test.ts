import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCPClient } from "@openhands/typescript-client/clients";
import {
  setActiveSelection,
  setRegisteredBackends,
} from "../backend-registry/active-store";
import SettingsService from "../settings-service/settings-service.api";
import McpService from "./mcp-service.api";

vi.mock("@openhands/typescript-client/clients", () => ({
  MCPClient: vi.fn(),
}));

const testServer = vi.fn();
const close = vi.fn();

const encryptedAuthorization = "gAAAAAencrypted-authorization-header";

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

  it("tests stored remote MCP credentials as encrypted headers, not redacted api_key text", async () => {
    vi.spyOn(SettingsService, "fetchSettingsFromApi").mockResolvedValue({
      llm_api_key_is_set: false,
      conversation_settings: {},
      agent_settings: {
        mcp_config: {
          mcpServers: {
            linear: {
              url: "https://mcp.linear.app/mcp",
              transport: "http",
              headers: {
                Authorization: encryptedAuthorization,
              },
            },
          },
        },
      },
    });

    await McpService.testServer({
      id: "shttp-0",
      type: "shttp",
      name: "linear",
      url: "https://mcp.linear.app/mcp",
      api_key: "<redacted>",
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
        headers: {
          Authorization: encryptedAuthorization,
        },
      },
    });
    expect(testServer.mock.calls[0][0].server).not.toHaveProperty("api_key");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
