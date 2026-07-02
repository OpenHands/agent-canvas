import { describe, it, expect, vi, beforeEach } from "vitest";
import McpService from "#/api/mcp-service/mcp-service.api";
import SettingsService, {
  type SettingsApiResponse,
} from "#/api/settings-service/settings-service.api";
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

    // Exact match also guards that non-catalog servers get no `tool_call`.
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

  // -------------------------------------------------------------------------
  // Credential verification for marketplace servers (Slack)
  //
  // The Slack MCP server lists its tools with any credentials and reports
  // upstream auth failures as ordinary text content, so the service attaches
  // a read-only verification tool call and interprets its payload.
  // -------------------------------------------------------------------------

  const SLACK_SERVER: MCPServerConfig = {
    id: "stdio-0",
    type: "stdio",
    name: "slack",
    command: "npx",
    args: ["-y", "@zencoderai/slack-mcp-server"],
    env: { SLACK_TEAM_ID: "T01", SLACK_BOT_TOKEN: "xoxb-abc" },
  };

  const slackToolResult = (text: string, isError = false) => ({
    ok: true,
    tools: ["slack_list_channels"],
    tool_result: { is_error: isError, text },
  });

  it("attaches the read-only Slack verification tool call to the request", async () => {
    mockTestServer.mockResolvedValue({ ok: true, tools: [] });

    await McpService.testServer(SLACK_SERVER);

    expect(mockTestServer).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_call: { name: "slack_list_channels", arguments: { limit: 1 } },
      }),
    );
  });

  it("maps an in-band Slack auth error to a credentials failure", async () => {
    mockTestServer.mockResolvedValue(
      slackToolResult('{"ok":false,"error":"invalid_auth"}'),
    );

    const result = await McpService.testServer(SLACK_SERVER);

    expect(result).toEqual({
      ok: false,
      error: "invalid_auth",
      error_kind: "credentials",
    });
  });

  it("does not flag non-auth Slack errors (missing_scope) as bad credentials", async () => {
    // A valid token lacking a scope authenticated successfully — failing it
    // would block correctly-configured installs.
    const response = slackToolResult('{"ok":false,"error":"missing_scope"}');
    mockTestServer.mockResolvedValue(response);

    const result = await McpService.testServer(SLACK_SERVER);

    expect(result).toEqual(response);
  });

  it("passes a succeeding Slack payload through unchanged", async () => {
    const response = slackToolResult('{"ok":true,"channels":[]}');
    mockTestServer.mockResolvedValue(response);

    const result = await McpService.testServer(SLACK_SERVER);

    expect(result).toEqual(response);
  });

  it("maps an errored verification call to a credentials failure", async () => {
    mockTestServer.mockResolvedValue(
      slackToolResult("Tool 'slack_list_channels' call timed out", true),
    );

    const result = await McpService.testServer(SLACK_SERVER);

    expect(result).toEqual({
      ok: false,
      error: "Tool 'slack_list_channels' call timed out",
      error_kind: "credentials",
    });
  });

  it("returns the response unchanged when an older backend omits tool_result", async () => {
    mockTestServer.mockResolvedValue({ ok: true, tools: ["a", "b"] });

    const result = await McpService.testServer(SLACK_SERVER);

    expect(result).toEqual({ ok: true, tools: ["a", "b"] });
  });

  // -------------------------------------------------------------------------
  // Redacted-secret round-trip for the edit flow
  //
  // The MCP page reads settings with redacted secrets, so unchanged env
  // values arrive as the literal "<redacted>" placeholder. The service swaps
  // them for the stored values in encrypted form (decrypted server-side) so
  // the test exercises the real credentials.
  // -------------------------------------------------------------------------

  const REDACTED_SLACK_SERVER: MCPServerConfig = {
    ...SLACK_SERVER,
    env: { SLACK_TEAM_ID: "T01", SLACK_BOT_TOKEN: "<redacted>" },
  };

  it("substitutes redacted env values with encrypted stored values", async () => {
    mockTestServer.mockResolvedValue({ ok: true, tools: [] });
    vi.spyOn(SettingsService, "fetchSettingsFromApi").mockResolvedValue({
      agent_settings: {
        mcp_config: {
          mcpServers: {
            slack: { env: { SLACK_BOT_TOKEN: "gAAAAA-encrypted-token" } },
          },
        },
      },
    } as unknown as SettingsApiResponse);

    await McpService.testServer(REDACTED_SLACK_SERVER);

    expect(SettingsService.fetchSettingsFromApi).toHaveBeenCalledWith(
      "encrypted",
    );
    expect(mockTestServer).toHaveBeenCalledWith(
      expect.objectContaining({
        server: expect.objectContaining({
          // Placeholder replaced by ciphertext; typed value left untouched.
          env: {
            SLACK_TEAM_ID: "T01",
            SLACK_BOT_TOKEN: "gAAAAA-encrypted-token",
          },
        }),
      }),
    );
  });

  it("keeps the placeholder when encrypted settings cannot be fetched", async () => {
    // e.g. HTTP 503 from a backend without a cipher — the test must still
    // run (and fail the credential check honestly) instead of crashing.
    mockTestServer.mockResolvedValue({ ok: true, tools: [] });
    vi.spyOn(SettingsService, "fetchSettingsFromApi").mockRejectedValue(
      new Error("503 no cipher"),
    );

    await McpService.testServer(REDACTED_SLACK_SERVER);

    expect(mockTestServer).toHaveBeenCalledWith(
      expect.objectContaining({
        server: expect.objectContaining({
          env: { SLACK_TEAM_ID: "T01", SLACK_BOT_TOKEN: "<redacted>" },
        }),
      }),
    );
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

  it("forwards auth: oauth in the server spec", async () => {
    mockTestServer.mockResolvedValue({ ok: true, tools: ["send_email"] });
    const oauthServer: MCPServerConfig = {
      id: "shttp-oauth-1",
      type: "shttp",
      url: "https://mcp.mail.superhuman.com/mcp",
      auth: "oauth",
    };

    await McpService.testServer(oauthServer);

    expect(mockTestServer).toHaveBeenCalledWith({
      server: {
        type: "shttp",
        url: "https://mcp.mail.superhuman.com/mcp",
        auth: "oauth",
      },
    });
  });
});
