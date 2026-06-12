import { describe, it, expect, vi, beforeEach } from "vitest";
import McpService from "#/api/mcp-service/mcp-service.api";
import * as activeStore from "#/api/backend-registry/active-store";
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

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: vi.fn(),
}));

const mockGetActiveBackend = vi.mocked(activeStore.getActiveBackend);

const localActive = () =>
  mockGetActiveBackend.mockReturnValue({
    backend: {
      id: "local-1",
      name: "Local",
      host: "http://localhost:3000",
      apiKey: "test-key",
      kind: "local",
    },
    orgId: null,
  });

const cloudActive = () =>
  mockGetActiveBackend.mockReturnValue({
    backend: {
      id: "cloud-1",
      name: "Cloud",
      host: "https://app.all-hands.dev",
      apiKey: "cloud-key",
      kind: "cloud",
    },
    orgId: null,
  });

const SERVER: MCPServerConfig = {
  id: "shttp-1",
  type: "shttp",
  url: "https://mcp.example.com/mcp",
};

describe("McpService.testServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localActive();
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
      error:
        "Client error '401 Unauthorized' for url https://mcp.example.com/mcp",
      error_kind: "unknown",
    });

    const result = await McpService.testServer(SERVER);

    expect(result).toEqual({
      ok: false,
      error:
        "Client error '401 Unauthorized' for url https://mcp.example.com/mcp",
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

  it("short-circuits with a synthetic ok response on cloud backends", async () => {
    // Regression: when the active backend is cloud, the local agent-server's
    // /api/mcp/test endpoint is not reachable. Previously, the helper threw
    // `NoBackendAvailableError("No backend is configured.")` which surfaced
    // in the install modal and blocked users from creating any MCP server
    // (e.g. Slack) on a cloud session.
    cloudActive();

    const result = await McpService.testServer(SERVER);

    expect(result).toEqual({ ok: true, tools: [] });
    expect(mockTestServer).not.toHaveBeenCalled();
  });
});
