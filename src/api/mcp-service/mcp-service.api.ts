import { MCPClient } from "@openhands/typescript-client/clients";
import type {
  MCPServerSpec,
  MCPTestResponse,
} from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";
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
