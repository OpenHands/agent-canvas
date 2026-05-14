import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { MCPServerConfig } from "#/types/mcp-server";
import { InstalledServerCard } from "./installed-server-card";

interface InstalledServersSectionProps {
  /** Already-filtered list — search filtering happens upstream. */
  servers: MCPServerConfig[];
  /**
   * True iff there is at least one installed server before applying
   * the search filter. Lets the section differentiate "nothing
   * installed yet" from "no installed servers match the current
   * search".
   */
  hasAnyInstalled: boolean;
  /** Current search query — empty string means no filter applied. */
  query?: string;
  onEdit: (server: MCPServerConfig) => void;
  onDelete: (serverId: string) => void;
}

export function InstalledServersSection({
  servers,
  hasAnyInstalled,
  query = "",
  onEdit,
  onDelete,
}: InstalledServersSectionProps) {
  const { t } = useTranslation("openhands");

  const isEmpty = servers.length === 0;

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
