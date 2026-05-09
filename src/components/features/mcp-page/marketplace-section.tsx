import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { MCP_MARKETPLACE, MarketplaceEntry } from "#/constants/mcp-marketplace";
import { isMarketplaceEntryAvailable } from "#/utils/mcp-marketplace-utils";
import { MarketplaceCard } from "./marketplace-card";

interface MarketplaceSectionProps {
  isInstalled: (entry: MarketplaceEntry) => boolean;
  backendKind: "local" | "cloud";
  onSelect: (entry: MarketplaceEntry) => void;
}

export function MarketplaceSection({
  isInstalled,
  backendKind,
  onSelect,
}: MarketplaceSectionProps) {
  const { t } = useTranslation("openhands");

  const visibleEntries = MCP_MARKETPLACE.filter((entry) =>
    isMarketplaceEntryAvailable(entry, backendKind),
  );

  return (
    <section
      data-testid="mcp-marketplace-section"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          {t(I18nKey.MCP$MARKETPLACE_TITLE)}
        </h2>
        <p className="text-xs text-tertiary-alt">
          {t(I18nKey.MCP$MARKETPLACE_DESCRIPTION)}
        </p>
      </div>

      <div
        data-testid="mcp-marketplace-grid"
        className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
      >
        {visibleEntries.map((entry) => (
          <MarketplaceCard
            key={entry.id}
            entry={entry}
            installed={isInstalled(entry)}
            onClick={() => onSelect(entry)}
          />
        ))}
      </div>
    </section>
  );
}
