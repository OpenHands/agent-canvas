import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { McpCatalogEntry as MarketplaceEntry } from "@openhands/extensions/mcps";
import { McpLogoBadge } from "#/components/features/mcp-logo-badge";
import { cn } from "#/utils/utils";

interface MarketplaceCardProps {
  entry: MarketplaceEntry;
  installed: boolean;
  onClick: () => void;
}

export function MarketplaceCard({
  entry,
  installed,
  onClick,
}: MarketplaceCardProps) {
  const { t } = useTranslation("openhands");

  const transportLabel = (() => {
    switch (entry.template.kind) {
      case "stdio":
        return "stdio";
      case "shttp":
        return "HTTP";
      case "sse":
        return "SSE";
      default:
        return "";
    }
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`mcp-marketplace-card-${entry.id}`}
      className={cn(
        "group relative flex min-h-[132px] flex-col overflow-hidden text-left",
        "rounded-xl border border-[var(--oh-border)] bg-base-secondary",
        "p-4 gap-3 cursor-pointer",
        "transition-all duration-200 hover:-translate-y-0.5",
        "hover:border-primary/35 hover:bg-base-tertiary/30",
        "focus:outline-none focus:ring-2 focus:ring-primary/50",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
      />
      <div className="flex items-start gap-3">
        <McpLogoBadge entry={entry} />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{entry.name}</h3>
            {installed && (
              <span
                data-testid={`mcp-marketplace-installed-${entry.id}`}
                className="shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-medium px-2 py-0.5 uppercase tracking-wide"
              >
                {t(I18nKey.MCP$INSTALLED_BADGE)}
              </span>
            )}
          </div>
          <p className="text-xs text-tertiary-alt mt-0.5">{transportLabel}</p>
        </div>
      </div>
      <p className="text-xs text-content-2 leading-relaxed line-clamp-3">
        {entry.description}
      </p>
    </button>
  );
}
