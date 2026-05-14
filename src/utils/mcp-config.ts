import {
  MCPConfig,
  MCPSSEServer,
  MCPSHTTPServer,
  MCPStdioServer,
  SettingsValue,
} from "#/types/settings";

const EMPTY_MCP_CONFIG: MCPConfig = {
  sse_servers: [],
  stdio_servers: [],
  shttp_servers: [],
};

type SdkMcpServerConfig = Record<string, SettingsValue>;
type SdkMcpConfig = { mcpServers: Record<string, SdkMcpServerConfig> };

/**
 * Parse an SDK mcp_config value ({ mcpServers: { ... } }) and convert it
 * to the frontend MCPConfig format used by UI components.
 */
export function parseMcpConfig(value: unknown): MCPConfig {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_MCP_CONFIG };
  }

  const obj = value as Record<string, unknown>;

  if (
    !("mcpServers" in obj) ||
    !obj.mcpServers ||
    typeof obj.mcpServers !== "object"
  ) {
    return { ...EMPTY_MCP_CONFIG };
  }

  const sseServers: (string | MCPSSEServer)[] = [];
  const stdioServers: MCPStdioServer[] = [];
  const shttpServers: (string | MCPSHTTPServer)[] = [];

  const mcpServers = obj.mcpServers as Record<string, Record<string, unknown>>;

  for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
    if (!serverConfig || typeof serverConfig !== "object") continue;

    const url = serverConfig.url as string | undefined;

    if (url) {
      const transport = serverConfig.transport as string | undefined;
      const auth = serverConfig.auth as string | undefined;
      const apiKey =
        typeof auth === "string" && auth !== "oauth" ? auth : undefined;

      if (transport === "sse") {
        const server: MCPSSEServer = { url };
        if (apiKey) server.api_key = apiKey;
        sseServers.push(server);
      } else {
        const server: MCPSHTTPServer = { url };
        if (apiKey) server.api_key = apiKey;
        if (serverConfig.timeout != null) {
          server.timeout = serverConfig.timeout as number;
        }
        shttpServers.push(server);
      }
    } else {
      const stdioServer: MCPStdioServer = {
        name: serverName,
        command: serverConfig.command as string,
      };
      if (serverConfig.args) {
        stdioServer.args = serverConfig.args as string[];
      }
      if (serverConfig.env) {
        stdioServer.env = serverConfig.env as Record<string, string>;
      }
      stdioServers.push(stdioServer);
    }
  }

  return {
    sse_servers: sseServers,
    stdio_servers: stdioServers,
    shttp_servers: shttpServers,
  };
}

/**
 * Convert the frontend MCPConfig format back to the SDK { mcpServers: { ... } }
 * shape expected by agent_settings.mcp_config on the backend.
 *
 * Names are only suffixed (``_1``, ``_2``, …) when an earlier entry has
 * already claimed the bare base name. We intentionally do NOT use a single
 * monotonic counter across server types: that would, for example, rename a
 * stdio server "myname" to "myname_1" the moment any sse/shttp entry is
 * persisted ahead of it, and shift the suffix on every save as the count
 * of other server types changes. With per-base collision suffixing,
 * unrelated entries keep their human-meaningful names stable across edits.
 */
export function toSdkMcpConfig(config: MCPConfig): SdkMcpConfig | null {
  const mcpServers: Record<string, SdkMcpServerConfig> = {};

  const reserve = (base: string): string => {
    if (!(base in mcpServers)) return base;
    let i = 1;
    while (`${base}_${i}` in mcpServers) i += 1;
    return `${base}_${i}`;
  };

  for (const entry of config.sse_servers) {
    const server: SdkMcpServerConfig = {};
    if (typeof entry === "string") {
      server.url = entry;
    } else {
      server.url = entry.url;
      if (entry.api_key) server.auth = entry.api_key;
    }
    server.transport = "sse";
    mcpServers[reserve("sse")] = server;
  }

  for (const entry of config.shttp_servers) {
    const server: SdkMcpServerConfig = {};
    if (typeof entry === "string") {
      server.url = entry;
    } else {
      server.url = entry.url;
      if (entry.api_key) server.auth = entry.api_key;
      if (entry.timeout != null) server.timeout = entry.timeout;
    }
    mcpServers[reserve("shttp")] = server;
  }

  for (const entry of config.stdio_servers) {
    const server: SdkMcpServerConfig = {
      command: entry.command,
    };
    if (entry.args) server.args = entry.args;
    if (entry.env) server.env = entry.env;
    mcpServers[reserve(entry.name || "stdio")] = server;
  }

  return Object.keys(mcpServers).length > 0 ? { mcpServers } : null;
}
