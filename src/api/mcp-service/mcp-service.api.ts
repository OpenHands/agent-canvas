import { MCPClient } from "@openhands/typescript-client/clients";
import type {
  MCPServerSpec,
  MCPTestRequest,
} from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import SettingsService from "#/api/settings-service/settings-service.api";
import { getCredentialValidationForServer } from "#/utils/mcp-credential-validation";
import type {
  ExtendedMCPTestResponse,
  MCPServerConfig,
} from "#/types/mcp-server";

// Placeholder the settings API substitutes for secret env values when
// settings are fetched without X-Expose-Secrets (the MCP page's mode).
const REDACTED_ENV_VALUE = "<redacted>";

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

/**
 * The MCP page reads settings with redacted secrets, so an env value the
 * user left unchanged in the edit form is the literal `<redacted>`
 * placeholder — testing with it would exercise garbage credentials. Swap
 * each placeholder for the stored value in encrypted form (the agent
 * server decrypts it before spawning), so "Test connection" exercises the
 * real stored credentials. Falls back to the placeholder when encrypted
 * settings are unavailable (e.g. no cipher configured) — the credential
 * check then fails honestly instead of crashing the test flow.
 */
async function substituteRedactedEnv(
  server: MCPServerConfig,
): Promise<MCPServerConfig> {
  if (server.type !== "stdio" || !server.name || !server.env) return server;
  const values = Object.values(server.env);
  if (!values.some((value) => value === REDACTED_ENV_VALUE)) return server;

  try {
    const response = await SettingsService.fetchSettingsFromApi("encrypted");
    const mcpConfig = response.agent_settings?.mcp_config as
      | { mcpServers?: Record<string, { env?: Record<string, string> }> }
      | undefined;
    const storedEnv = mcpConfig?.mcpServers?.[server.name]?.env ?? {};
    const env = Object.fromEntries(
      Object.entries(server.env).map(([key, value]) => [
        key,
        value === REDACTED_ENV_VALUE && typeof storedEnv[key] === "string"
          ? storedEnv[key]
          : value,
      ]),
    );
    return { ...server, env };
  } catch {
    return server;
  }
}

class McpService {
  static async testServer(
    server: MCPServerConfig,
  ): Promise<ExtendedMCPTestResponse> {
    const validation = getCredentialValidationForServer(server);
    const serverSpec = toMcpServerSpec(await substituteRedactedEnv(server));
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
