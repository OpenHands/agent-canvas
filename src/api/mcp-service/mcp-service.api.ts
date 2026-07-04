import { MCPClient } from "@openhands/typescript-client/clients";
import type {
  MCPServerSpec,
  MCPTestRequest,
} from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import { getActiveBackend } from "../backend-registry/active-store";
import { getCredentialValidationForServer } from "#/utils/mcp-credential-validation";
import type {
  ExtendedMCPTestResponse,
  MCPServerConfig,
} from "#/types/mcp-server";
import { substituteRedactedMcpCredentials } from "./mcp-redacted-credentials";
import type { MCPAuthCredential } from "#/types/mcp-auth";

const OAUTH_MCP_TEST_TIMEOUT_SECONDS = 120;

function toMcpServerSpec(server: MCPServerConfig): MCPServerSpec {
  if (server.type === "stdio") {
    return {
      type: "stdio",
      command: server.command!,
      ...(server.args?.length && { args: server.args }),
      ...(server.env &&
        Object.keys(server.env).length > 0 && { env: server.env }),
    };
  }
  return {
    type: server.type,
    url: server.url!,
    ...(server.headers &&
      Object.keys(server.headers).length > 0 && { headers: server.headers }),
    ...(server.auth ? { auth: server.auth } : {}),
  } as MCPServerSpec;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isMcpAuthCredential(value: unknown): value is MCPAuthCredential {
  return (
    isRecord(value) &&
    typeof value.strategy === "string" &&
    ["none", "api_key", "bearer", "basic", "header", "oauth2"].includes(
      value.strategy,
    )
  );
}

function serverSpecToConfig(
  original: MCPServerConfig,
  spec: Record<string, unknown>,
): MCPServerConfig {
  return {
    ...original,
    ...(typeof spec.url === "string" ? { url: spec.url } : {}),
    ...(isMcpAuthCredential(spec.auth) ? { auth: spec.auth } : {}),
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
    const serverSpec = toMcpServerSpec(
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
      let result = (await client.testServer(
        request as MCPTestRequest,
      )) as ExtendedMCPTestResponse & { server?: unknown };
      if (result.ok && isRecord(result.server)) {
        result = {
          ...result,
          server: serverSpecToConfig(server, result.server),
        };
      }
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
