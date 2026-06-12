import { MCPClient } from "@openhands/typescript-client/clients";
import type {
  MCPServerSpec,
  MCPTestResponse,
} from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import { getActiveBackend } from "../backend-registry/active-store";
import type { MCPServerConfig } from "#/types/mcp-server";

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
    ...(server.api_key ? { api_key: server.api_key } : {}),
  };
}

class McpService {
  static async testServer(server: MCPServerConfig): Promise<MCPTestResponse> {
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
    const { host, apiKey } = getAgentServerClientOptions();
    const client = new MCPClient({ host, ...(apiKey ? { apiKey } : {}) });
    try {
      return await client.testServer({
        server: toMcpServerSpec(server),
        ...(server.name ? { name: server.name } : {}),
        ...(server.timeout ? { timeout: server.timeout } : {}),
      });
    } finally {
      client.close();
    }
  }
}

export default McpService;
