import React from "react";
import { Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { McpLogoBadge } from "#/components/features/mcp-logo-badge";
import { CirclePlusCheckToggle } from "#/components/shared/buttons/circle-plus-check-toggle";
import { MCPServerConfig } from "#/types/mcp-server";
import { MCP_CATALOG as MCP_MARKETPLACE } from "@openhands/extensions/mcps";
import { findCatalogEntryForServer } from "#/utils/mcp-marketplace-utils";
import { cn } from "#/utils/utils";
import {
  extensionModuleCardInteractiveClassName,
  extensionModuleCardSurfaceClassName,
} from "#/utils/extension-module-card-classes";

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
  const catalog = findCatalogEntryForServer(server, MCP_MARKETPLACE);

  const title = catalog?.name ?? getServerTitle(server);
  const subtitle = getServerSubtitle(server);
  const transport = getServerTransportLabel(server.type);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEdit();
    }
  };

  return (
    <div
      data-testid="mcp-server-item"
      data-server-id={server.id}
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={handleKeyDown}
      aria-label={t(I18nKey.MCP$EDIT_SERVER_ARIA, { name: title })}
      className={cn(
        "flex items-start gap-3 p-4",
        extensionModuleCardSurfaceClassName,
        extensionModuleCardInteractiveClassName,
      )}
    >
      <McpLogoBadge entry={catalog} fallback={<Puzzle strokeWidth={2.25} />} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold" title={title}>
                {title}
              </h3>
              <span className="shrink-0 rounded-full bg-tertiary px-2 py-0.5 text-[10px] font-medium uppercase text-tertiary-alt">
                {transport}
              </span>
            </div>
            {subtitle ? (
              <p className="truncate text-xs text-content-2" title={subtitle}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <CirclePlusCheckToggle
            testId={`mcp-installed-toggle-${server.id}`}
            isSelected
            onToggle={(selected) => {
              if (!selected) {
                onDelete();
              }
            }}
            enableLabelKey={I18nKey.MCP$TOGGLE_ADD_SERVER}
            disableLabelKey={I18nKey.MCP$TOGGLE_REMOVE_SERVER}
          />
        </div>
      </div>
    </div>
  );
}
