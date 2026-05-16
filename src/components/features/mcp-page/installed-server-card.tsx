import { Puzzle, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { MCPServerConfig } from "#/types/mcp-server";
import { MCP_MARKETPLACE } from "#/constants/mcp-marketplace";
import { findCatalogEntryForServer } from "#/utils/mcp-marketplace-utils";
import { cn } from "#/utils/utils";

interface InstalledServerCardProps {
  server: MCPServerConfig;
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

export function InstalledServerCard({
  server,
  onEdit,
  onDelete,
}: InstalledServerCardProps) {
  const { t } = useTranslation("openhands");
  // Match-by-content is delegated to the shared utility so this card
  // and `findInstalledMatch` agree on URL canonicalization (trailing
  // slashes, query strings, default ports) and stay in sync when one
  // is updated.
  const catalog = findCatalogEntryForServer(server, MCP_MARKETPLACE);

  const title = catalog?.name ?? getServerTitle(server);
  const subtitle = getServerSubtitle(server);
  const transport = getServerTransportLabel(server.type);

  return (
    <div
      data-testid="mcp-server-item"
      data-server-id={server.id}
      className={cn(
        "flex items-start gap-3 rounded-xl",
        "border border-[var(--oh-border)] bg-base-secondary p-4",
      )}
    >
      <span
        aria-hidden="true"
        className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-lg"
        style={{
          backgroundColor: catalog?.iconBg ?? "var(--oh-color-tertiary)",
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
          <p className="text-xs text-content-2 truncate" title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          data-testid="edit-mcp-server-button"
          type="button"
          onClick={onEdit}
          aria-label={t(I18nKey.MCP$EDIT_SERVER_ARIA, { name: title })}
          className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted transition-colors hover:bg-interactive-hover hover:text-white"
        >
          <Pencil aria-hidden className="size-3.5" strokeWidth={2} />
        </button>
        <button
          data-testid="delete-mcp-server-button"
          type="button"
          onClick={onDelete}
          aria-label={t(I18nKey.MCP$DELETE_SERVER_ARIA, { name: title })}
          className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted transition-colors hover:bg-interactive-hover hover:text-white"
        >
          <Trash2 aria-hidden className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
