import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { MCPServerConfig } from "#/types/mcp-server";
import { InstalledServerCard } from "./installed-server-card";

interface InstalledServersSectionProps {
  /** Already-filtered list — search filtering happens upstream. */
  servers: MCPServerConfig[];
  /**
   * Tavily has a virtual "installed" card when search_api_key is set
   * on the backend. Pass `true` when it matches the current search.
   */
  tavilyBuiltinInstalled?: boolean;
  /**
   * True iff there is at least one installed server (or the Tavily
   * builtin) before applying the search filter. Lets the section
   * differentiate "nothing installed yet" from "no installed servers
   * match the current search".
   */
  hasAnyInstalled: boolean;
  /** Current search query — empty string means no filter applied. */
  query?: string;
  onEdit: (server: MCPServerConfig) => void;
  onDelete: (serverId: string) => void;
  onConfigureTavilyBuiltin?: () => void;
  onRemoveTavilyBuiltin?: () => void;
}

export function InstalledServersSection({
  servers,
  tavilyBuiltinInstalled,
  hasAnyInstalled,
  query = "",
  onEdit,
  onDelete,
  onConfigureTavilyBuiltin,
  onRemoveTavilyBuiltin,
}: InstalledServersSectionProps) {
  const { t } = useTranslation("openhands");

  const isEmpty = servers.length === 0 && !tavilyBuiltinInstalled;

  if (isEmpty) {
    // Filter narrowed everything out — vs. nothing was installed in
    // the first place. Different copy in each case.
    if (hasAnyInstalled && query.trim().length > 0) {
      return (
        <div
          data-testid="mcp-installed-empty-search"
          className="rounded-xl border border-dashed border-tertiary p-6 text-center"
        >
          <p className="text-xs text-tertiary-alt">
            {t(I18nKey.MCP$SEARCH_EMPTY)}
          </p>
        </div>
      );
    }
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
