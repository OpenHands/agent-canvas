import { FaPencil, FaTrash } from "react-icons/fa6";
import { Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { MCPServerConfig } from "#/types/mcp-server";
import { MCP_MARKETPLACE } from "#/constants/mcp-marketplace";
import { cn } from "#/utils/utils";

interface InstalledServerCardProps {
  server: MCPServerConfig;
  /** Force a specific marketplace catalog id — used for Tavily where the
   * persisted shape (search_api_key) doesn't look like a normal MCP
   * server. */
  catalogIdOverride?: string;
  onEdit: () => void;
  onDelete: () => void;
}

function getServerTransportLabel(type: MCPServerConfig["type"]) {
  switch (type) {
    case "sse":
      return "SSE";
    case "shttp":
      return "HTTP";
    case "stdio":
      return "stdio";
    default:
      return type;
  }
}

function getServerTitle(server: MCPServerConfig): string {
  if (server.type === "stdio") return server.name ?? server.command ?? "";
  return server.url ?? "";
}

function getServerSubtitle(server: MCPServerConfig): string {
  if (server.type === "stdio") {
    const args =
      server.args && server.args.length > 0 ? ` ${server.args.join(" ")}` : "";
    return `${server.command ?? ""}${args}`.trim();
  }
  return server.url ?? "";
}

/** Best-effort match between an installed server and a catalog tile so
 * we can render the friendly icon/name. */
function findCatalogMatch(server: MCPServerConfig) {
  return MCP_MARKETPLACE.find((entry) => {
    const tpl = entry.template;
    if (tpl.kind === "tavily-builtin") return false;
    if (tpl.kind === "stdio")
      return server.type === "stdio" && server.name === tpl.serverName;
    if (tpl.kind === "shttp")
      return server.type === "shttp" && server.url === tpl.url;
    if (tpl.kind === "sse")
      return server.type === "sse" && server.url === tpl.url;
    return false;
  });
}

export function InstalledServerCard({
  server,
  catalogIdOverride,
  onEdit,
  onDelete,
}: InstalledServerCardProps) {
  const { t } = useTranslation("openhands");
  const catalog = catalogIdOverride
    ? MCP_MARKETPLACE.find((entry) => entry.id === catalogIdOverride)
    : findCatalogMatch(server);

  const title = catalog?.name ?? getServerTitle(server);
  const subtitle = catalogIdOverride ? "" : getServerSubtitle(server);
  const transport = catalogIdOverride
    ? t(I18nKey.MCP$TRANSPORT_BUILTIN)
    : getServerTransportLabel(server.type);

  return (
    <div
      data-testid="mcp-server-item"
      data-server-id={server.id}
      className={cn(
        "flex items-start gap-3 rounded-xl",
        "border border-tertiary bg-base-secondary p-4",
      )}
    >
      <span
        aria-hidden="true"
        className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-lg"
        style={{
          backgroundColor: catalog?.iconBg ?? "#3F4452",
          color: catalog?.iconColor ?? "#FFFFFF",
        }}
      >
        {catalog?.logo ?? <Puzzle className="h-5 w-5" strokeWidth={2.25} />}
      </span>

      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate" title={title}>
            {title}
          </h3>
          <span className="shrink-0 rounded-full bg-tertiary text-tertiary-alt text-[10px] font-medium px-2 py-0.5 uppercase">
            {transport}
          </span>
        </div>
        {subtitle && (
          <p
            className="text-xs text-content-2 italic truncate"
            title={subtitle}
          >
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          data-testid="edit-mcp-server-button"
          type="button"
          onClick={onEdit}
          aria-label={t(I18nKey.MCP$EDIT_SERVER_ARIA, { name: title })}
          className="text-content-2 hover:text-content-1 transition-colors cursor-pointer"
        >
          <FaPencil size={14} />
        </button>
        <button
          data-testid="delete-mcp-server-button"
          type="button"
          onClick={onDelete}
          aria-label={t(I18nKey.MCP$DELETE_SERVER_ARIA, { name: title })}
          className="text-content-2 hover:text-red-500 transition-colors cursor-pointer"
        >
          <FaTrash size={14} />
        </button>
      </div>
    </div>
  );
}
