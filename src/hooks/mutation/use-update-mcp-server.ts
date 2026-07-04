import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "#/hooks/query/use-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MCPConfig } from "#/types/settings";
import { MCPServerConfig } from "#/types/mcp-server";
import {
  parseMcpConfig,
  toMcpShttpServer,
  toMcpSseServer,
  toMcpStdioServer,
  toSdkMcpServers,
} from "#/utils/mcp-config";
import { SETTINGS_QUERY_KEYS } from "#/hooks/query/query-keys";
import { substituteRedactedMcpCredentials } from "#/api/mcp-service/mcp-redacted-credentials";

export function useUpdateMcpServer() {
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();

  return useMutation({
    mutationFn: async ({
      serverId,
      server,
    }: {
      serverId: string;
      server: MCPServerConfig;
    }): Promise<void> => {
      const currentConfig = parseMcpConfig(
        settings?.agent_settings?.mcp_servers,
      );

      const newConfig: MCPConfig = {
        sse_servers: [...currentConfig.sse_servers],
        stdio_servers: [...currentConfig.stdio_servers],
        shttp_servers: [...currentConfig.shttp_servers],
      };
      const serverToSave = await substituteRedactedMcpCredentials(server);
      const [serverType, indexStr] = serverId.split("-");
      const index = parseInt(indexStr, 10);

      if (serverType === "sse") {
        newConfig.sse_servers[index] = toMcpSseServer(serverToSave);
      } else if (serverType === "stdio") {
        newConfig.stdio_servers[index] = toMcpStdioServer(serverToSave);
      } else if (serverType === "shttp") {
        newConfig.shttp_servers[index] = toMcpShttpServer(serverToSave);
      }

      await SettingsService.saveSettings({
        agent_settings_diff: { mcp_servers: toSdkMcpServers(newConfig) },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: SETTINGS_QUERY_KEYS.personal(),
      });
    },
  });
}
