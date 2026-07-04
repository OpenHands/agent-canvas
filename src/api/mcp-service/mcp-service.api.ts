import { MCPClient } from "@openhands/typescript-client/clients";
import type { MCPTestRequest } from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import { getActiveBackend } from "../backend-registry/active-store";
import { getCredentialValidationForServer } from "#/utils/mcp-credential-validation";
import type {
  ExtendedMCPTestResponse,
  MCPServerConfig,
} from "#/types/mcp-server";
import type { MCPAuthCredential } from "#/types/mcp-auth";
import { substituteRedactedMcpCredentials } from "./mcp-redacted-credentials";

const OAUTH_MCP_TEST_TIMEOUT_SECONDS = 120;

type MCPTestServer = {
  transport?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  auth?: MCPAuthCredential;
};

function toMcpServer(server: MCPServerConfig): MCPTestServer {
  if (server.type === "stdio") {
    return {
      transport: "stdio",
      command: server.command!,
      ...(server.args?.length && { args: server.args }),
      ...(server.env &&
        Object.keys(server.env).length > 0 && { env: server.env }),
    };
  }
  return {
    transport: server.type === "sse" ? "sse" : "http",
    url: server.url!,
    ...(server.headers &&
      Object.keys(server.headers).length > 0 && { headers: server.headers }),
    ...(server.auth ? { auth: server.auth } : {}),
  };
}

function getMcpTestTimeout(server: MCPServerConfig): number | undefined {
  if (server.auth?.strategy !== "oauth2") return server.timeout;
  return OAUTH_MCP_TEST_TIMEOUT_SECONDS;
}

class McpService {
  static async testServer(
    server: MCPServerConfig,
  ): Promise<ExtendedMCPTestResponse> {
    // The MCP connectivity-test endpoint lives on the local agent-server. It
    // spawns the configured stdio command / opens an SSE-or-SHTTP connection
    // from that process's environment. Cloud backends don't expose this
    // endpoint to the frontend — the MCP server would actually run inside the
    // cloud sandbox, which isn't reachable from the browser before the user
    // starts a conversation. Calling `getAgentServerClientOptions()` here for
    // a cloud-active session would throw `NoBackendAvailableError("No backend
    // is configured.")` and block the install flow entirely. Short-circuit
    // with a synthetic success so saving proceeds; any real connection
    // failure surfaces inside the conversation runtime instead.
    if (getActiveBackend().backend.kind === "cloud") {
      return { ok: true, tools: [] };
    }
    const validation = getCredentialValidationForServer(server);
    const serverSpec = toMcpServer(
      await substituteRedactedMcpCredentials(server),
    );
    const { host, apiKey } = getAgentServerClientOptions();
    const client = new MCPClient({ host, ...(apiKey ? { apiKey } : {}) });
    try {
      const timeout = getMcpTestTimeout(server);
      const request = {
        server: serverSpec,
        ...(server.name ? { name: server.name } : {}),
        ...(timeout !== undefined ? { timeout } : {}),
        ...(validation ? { tool_call: validation.toolCall } : {}),
      };
      const result = (await client.testServer(
        request as MCPTestRequest,
      )) as ExtendedMCPTestResponse;
      if (result.ok && validation && result.tool_result) {
        const credentialError = validation.interpret(result.tool_result);
        if (credentialError) {
          return {
            ok: false,
            error: credentialError,
            error_kind: "credentials",
          };
        }
      }
      return result;
    } finally {
      client.close();
    }
  }
}

export default McpService;
