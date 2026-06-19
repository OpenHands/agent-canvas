import SettingsService from "#/api/settings-service/settings-service.api";
import type { MCPServerConfig } from "#/types/mcp-server";
import { REDACTED_MCP_SECRET_VALUE } from "#/utils/mcp-config";

type StoredMcpServer = {
  url?: unknown;
  transport?: unknown;
  env?: unknown;
  headers?: unknown;
};

type StoredMcpServers = Record<string, StoredMcpServer>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const stringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const hasRedactedValue = (values: Record<string, string> | undefined) =>
  !!values &&
  Object.values(values).some((value) => value === REDACTED_MCP_SECRET_VALUE);

const remoteTransportMatches = (
  type: MCPServerConfig["type"],
  transport: unknown,
) => {
  if (type === "sse") return transport === "sse";
  if (type === "shttp") {
    return (
      transport === undefined ||
      transport === "http" ||
      transport === "shttp" ||
      transport === "streamable-http"
    );
  }
  return false;
};

const findStoredServer = (
  server: MCPServerConfig,
  storedServers: StoredMcpServers,
): StoredMcpServer | undefined => {
  if (server.name && storedServers[server.name]) {
    return storedServers[server.name];
  }

  if (server.type === "stdio") return undefined;

  return Object.values(storedServers).find(
    (stored) =>
      stored.url === server.url &&
      remoteTransportMatches(server.type, stored.transport),
  );
};

async function fetchEncryptedStoredServer(
  server: MCPServerConfig,
): Promise<StoredMcpServer | undefined> {
  const response = await SettingsService.fetchSettingsFromApi("encrypted");
  const mcpConfig = response.agent_settings?.mcp_config;
  if (!isRecord(mcpConfig) || !isRecord(mcpConfig.mcpServers)) {
    return undefined;
  }
  return findStoredServer(server, mcpConfig.mcpServers as StoredMcpServers);
}

/**
 * The MCP editor sees redacted settings (`<redacted>`). When the user leaves
 * a secret unchanged, replace that placeholder with the stored encrypted
 * env/header value so tests and saves round-trip the real credential without
 * exposing plaintext in the browser.
 */
export async function substituteRedactedMcpCredentials(
  server: MCPServerConfig,
): Promise<MCPServerConfig> {
  const redactedStdioEnv =
    server.type === "stdio" && hasRedactedValue(server.env);
  const redactedRemoteApiKey =
    (server.type === "sse" || server.type === "shttp") &&
    server.api_key === REDACTED_MCP_SECRET_VALUE;

  if (!redactedStdioEnv && !redactedRemoteApiKey) return server;

  try {
    const stored = await fetchEncryptedStoredServer(server);
    if (!stored) return server;

    if (redactedStdioEnv) {
      const storedEnv = stringRecord(stored.env) ?? {};
      const env = Object.fromEntries(
        Object.entries(server.env ?? {}).map(([key, value]) => [
          key,
          value === REDACTED_MCP_SECRET_VALUE &&
          typeof storedEnv[key] === "string"
            ? storedEnv[key]
            : value,
        ]),
      );
      return { ...server, env };
    }

    const headers = stringRecord(stored.headers);
    if (!headers) return server;
    return { ...server, api_key: undefined, headers };
  } catch {
    return server;
  }
}
