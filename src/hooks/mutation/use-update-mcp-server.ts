import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "#/hooks/query/use-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import {
  MCPSHTTPServer,
  MCPConfig,
  MCPSSEServer,
  MCPStdioServer,
} from "#/types/settings";
import { MCPServerConfig } from "#/types/mcp-server";
import { parseMcpConfig, toSdkMcpConfig } from "#/utils/mcp-config";
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
        settings?.agent_settings?.mcp_config,
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
        const sseServer: MCPSSEServer = {
          ...(serverToSave.name && { name: serverToSave.name }),
          url: serverToSave.url!,
          ...(serverToSave.api_key && { api_key: serverToSave.api_key }),
          ...(serverToSave.headers && { headers: serverToSave.headers }),
        };
        newConfig.sse_servers[index] = sseServer;
      } else if (serverType === "stdio") {
        const stdioServer: MCPStdioServer = {
          name: serverToSave.name!,
          command: serverToSave.command!,
          ...(serverToSave.args && { args: serverToSave.args }),
          ...(serverToSave.env && { env: serverToSave.env }),
        };
        newConfig.stdio_servers[index] = stdioServer;
      } else if (serverType === "shttp") {
        const shttpServer: MCPSHTTPServer = {
          ...(serverToSave.name && { name: serverToSave.name }),
          url: serverToSave.url!,
          ...(serverToSave.api_key && { api_key: serverToSave.api_key }),
          ...(serverToSave.headers && { headers: serverToSave.headers }),
          ...(serverToSave.timeout !== undefined && {
            timeout: serverToSave.timeout,
          }),
        };
        newConfig.shttp_servers[index] = shttpServer;
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
