import { describe, it, expect, vi, beforeEach } from "vitest";
import McpService from "#/api/mcp-service/mcp-service.api";
import type { MCPServerConfig } from "#/types/mcp-server";

// vi.mock factories are hoisted before imports, so spy functions must be
// created with vi.hoisted() to be in scope inside the factory.
const { mockTestServer } = vi.hoisted(() => ({
  mockTestServer: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  // Real class so `new MCPClient(...)` works; testServer delegates to the
  // shared spy so each test can configure the return value independently.
  MCPClient: class {
    // eslint-disable-next-line class-methods-use-this
    testServer = mockTestServer;

    // eslint-disable-next-line class-methods-use-this
    close = vi.fn();
  },
}));

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: () => ({
    host: "http://localhost:3000",
    apiKey: "test-key",
  }),
}));

const SERVER: MCPServerConfig = {
  id: "shttp-1",
  type: "shttp",
  url: "https://mcp.example.com/mcp",
};

describe("McpService.testServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes success responses through unchanged", async () => {
    mockTestServer.mockResolvedValue({ ok: true, tools: ["search", "fetch"] });

    const result = await McpService.testServer(SERVER);

    expect(result).toEqual({ ok: true, tools: ["search", "fetch"] });
  });

  it("passes failure responses through unchanged (no server-side escaping)", async () => {
    // The backend returns plain text; HTML-escaping of {{-error}} is handled
    // by the i18next no-escape prefix in the translation string, not here.
    mockTestServer.mockResolvedValue({
      ok: false,
      error: "Client error '401 Unauthorized' for url https://mcp.example.com/mcp",
      error_kind: "unknown",
    });

    const result = await McpService.testServer(SERVER);

    expect(result).toEqual({
      ok: false,
      error: "Client error '401 Unauthorized' for url https://mcp.example.com/mcp",
      error_kind: "unknown",
    });
  });

  it("maps a stdio config to a StdioMCPServerSpec", async () => {
    mockTestServer.mockResolvedValue({ ok: true, tools: [] });
    const stdio: MCPServerConfig = {
      id: "stdio-1",
      type: "stdio",
      name: "my-server",
      command: "npx",
      args: ["-y", "@my/mcp-server"],
      env: { API_KEY: "secret" },
    };

    await McpService.testServer(stdio);

    expect(mockTestServer).toHaveBeenCalledWith({
      server: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@my/mcp-server"],
        env: { API_KEY: "secret" },
      },
      name: "my-server",
    });
  });
});
