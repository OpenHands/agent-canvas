import { MCPClient } from "@openhands/typescript-client/clients";
import type {
  MCPServerSpec,
  MCPTestResponse,
} from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import type { MCPServerConfig } from "#/types/mcp-server";

/**
 * The backend HTML-escapes error strings (e.g. via Python's html.escape).
 * Decode them with a temporary textarea so the UI shows plain text.
 */
function decodeHtmlEntities(str: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

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
      const result = await client.testServer({
        server: toMcpServerSpec(server),
        ...(server.name ? { name: server.name } : {}),
        ...(server.timeout ? { timeout: server.timeout } : {}),
      });
      if (!result.ok) {
        return { ...result, error: decodeHtmlEntities(result.error) };
      }
      return result;
    } finally {
      client.close();
    }
  }
}

export default McpService;
