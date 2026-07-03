import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "#/hooks/query/use-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import {
  MCPSHTTPServer,
  MCPConfig,
  MCPSSEServer,
  MCPStdioServer,
} from "#/types/settings";
import type { MCPServerConfig } from "#/types/mcp-server";
import { parseMcpConfig, toSdkMcpConfig } from "#/utils/mcp-config";
import { SETTINGS_QUERY_KEYS } from "#/hooks/query/query-keys";

export function useAddMcpServer() {
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();

  return useMutation({
    mutationFn: async (server: MCPServerConfig): Promise<void> => {
      if (!settings) return;

      const currentConfig = parseMcpConfig(settings.agent_settings?.mcp_config);

      const newConfig: MCPConfig = {
        sse_servers: [...currentConfig.sse_servers],
        stdio_servers: [...currentConfig.stdio_servers],
        shttp_servers: [...currentConfig.shttp_servers],
      };

      if (server.type === "sse") {
        const sseServer: MCPSSEServer = {
          ...(server.name && { name: server.name }),
          url: server.url!,
          ...(server.api_key && { api_key: server.api_key }),
          ...(server.headers && { headers: server.headers }),
          ...(server.auth && { auth: server.auth }),
          ...(server.authentication && {
            authentication: server.authentication,
          }),
          ...(server.oauth_credentials && {
            oauth_credentials: server.oauth_credentials,
          }),
        };
        newConfig.sse_servers.push(sseServer);
      } else if (server.type === "stdio") {
        const stdioServer: MCPStdioServer = {
          name: server.name!,
          command: server.command!,
          ...(server.args && { args: server.args }),
          ...(server.env && { env: server.env }),
        };
        newConfig.stdio_servers.push(stdioServer);
      } else if (server.type === "shttp") {
        const shttpServer: MCPSHTTPServer = {
          ...(server.name && { name: server.name }),
          url: server.url!,
          ...(server.api_key && { api_key: server.api_key }),
          ...(server.headers && { headers: server.headers }),
          ...(server.timeout !== undefined && { timeout: server.timeout }),
          ...(server.auth && { auth: server.auth }),
          ...(server.authentication && {
            authentication: server.authentication,
          }),
          ...(server.oauth_credentials && {
            oauth_credentials: server.oauth_credentials,
          }),
        };
        newConfig.shttp_servers.push(shttpServer);
      }

      await SettingsService.saveSettings({
        agent_settings_diff: { mcp_config: toSdkMcpConfig(newConfig) },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: SETTINGS_QUERY_KEYS.personal(),
      });
    },
  });
}
