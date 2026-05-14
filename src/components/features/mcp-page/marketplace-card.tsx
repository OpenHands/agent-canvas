import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { MarketplaceEntry } from "#/constants/mcp-marketplace";
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
        "group flex flex-col text-left",
        "rounded-xl border border-tertiary bg-base-secondary",
        "p-4 gap-3 cursor-pointer",
        "hover:border-white/40 hover:bg-base-tertiary/30 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-primary/60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 inline-flex items-center justify-center",
            "h-10 w-10 rounded-lg",
          )}
          style={{
            backgroundColor: entry.iconBg,
            color: entry.iconColor ?? "#FFFFFF",
          }}
        >
          {entry.logo}
        </span>
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
