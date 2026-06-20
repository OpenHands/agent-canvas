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
    ...(server.api_key ? { api_key: server.api_key } : {}),
  } as MCPServerSpec;
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
      // `tool_call` / `tool_result` aren't in the published client types
      // yet; the client POSTs the request object and returns the response
      // body as-is, so the extra fields round-trip at runtime. Old agent
      // servers ignore `tool_call` and return no `tool_result`, in which
      // case the response passes through uninterpreted (legacy behavior).
      const request = {
        server: serverSpec,
        ...(server.name ? { name: server.name } : {}),
        ...(server.timeout ? { timeout: server.timeout } : {}),
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
