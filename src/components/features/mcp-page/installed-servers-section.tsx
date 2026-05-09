import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { MCPServerConfig } from "#/types/mcp-server";
import { InstalledServerCard } from "./installed-server-card";

interface InstalledServersSectionProps {
  servers: MCPServerConfig[];
  /** Tavily-specific entry: when search_api_key is set the agent server
   * registers a Tavily MCP automatically — surface it as a virtual card
   * so it can be removed from the same place as everything else. */
  tavilyBuiltinInstalled?: boolean;
  onEdit: (server: MCPServerConfig) => void;
  onDelete: (serverId: string) => void;
  onConfigureTavilyBuiltin?: () => void;
  onRemoveTavilyBuiltin?: () => void;
}

export function InstalledServersSection({
  servers,
  tavilyBuiltinInstalled,
  onEdit,
  onDelete,
  onConfigureTavilyBuiltin,
  onRemoveTavilyBuiltin,
}: InstalledServersSectionProps) {
  const { t } = useTranslation("openhands");

  const isEmpty = servers.length === 0 && !tavilyBuiltinInstalled;

  if (isEmpty) {
    return (
      <div
        data-testid="mcp-installed-empty"
        className="rounded-xl border border-dashed border-tertiary p-8 text-center"
      >
        <p className="text-sm text-content-2">
          {t(I18nKey.MCP$INSTALLED_EMPTY_TITLE)}
        </p>
        <p className="text-xs text-tertiary-alt mt-1">
          {t(I18nKey.MCP$INSTALLED_EMPTY_HINT)}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="mcp-installed-list"
      className="grid gap-3 grid-cols-1 md:grid-cols-2"
    >
      {tavilyBuiltinInstalled && (
        <InstalledServerCard
          catalogIdOverride="tavily"
          server={{ id: "tavily-builtin", type: "shttp" }}
          onEdit={() => onConfigureTavilyBuiltin?.()}
          onDelete={() => onRemoveTavilyBuiltin?.()}
        />
      )}
      {servers.map((server) => (
        <InstalledServerCard
          key={server.id}
          server={server}
          onEdit={() => onEdit(server)}
          onDelete={() => onDelete(server.id)}
        />
      ))}
    </div>
  );
}
