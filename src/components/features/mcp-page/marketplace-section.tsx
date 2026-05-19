import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  MCP_CATALOG as MCP_MARKETPLACE,
  type McpCatalogEntry as MarketplaceEntry,
} from "@openhands/extensions/mcps";
import {
  getMarketplaceEntriesByPopularity,
  isMarketplaceEntryAvailable,
  marketplaceEntryMatchesQuery,
} from "#/utils/mcp-marketplace-utils";
import { MarketplaceCard } from "./marketplace-card";

interface MarketplaceSectionProps {
  isInstalled: (entry: MarketplaceEntry) => boolean;
  backendKind: "local" | "cloud";
  onSelect: (entry: MarketplaceEntry) => void;
  /** Empty string = no filter. */
  query?: string;
}

export function MarketplaceSection({
  isInstalled,
  backendKind,
  onSelect,
  query = "",
}: MarketplaceSectionProps) {
  const { t } = useTranslation("openhands");

  const visibleEntries = getMarketplaceEntriesByPopularity(
    MCP_MARKETPLACE,
  ).filter(
    (entry) =>
      isMarketplaceEntryAvailable(entry, backendKind) &&
      marketplaceEntryMatchesQuery(entry, query),
  );

  return (
    <section
      data-testid="mcp-marketplace-section"
      className="flex flex-col gap-3"
    >
      <h2 className="text-base font-semibold text-foreground">
        {t(I18nKey.MCP$LIBRARY_TITLE)}
      </h2>

      {visibleEntries.length === 0 ? (
        <div
          data-testid="mcp-marketplace-empty"
          className="rounded-xl border border-dashed border-[var(--oh-border)] p-6 text-center"
        >
          <p className="text-xs text-tertiary-alt">
            {t(I18nKey.MCP$SEARCH_EMPTY)}
          </p>
        </div>
      ) : (
        <div
          data-testid="mcp-marketplace-grid"
          className="grid gap-3 grid-cols-1 md:grid-cols-2"
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
      )}
    </section>
  );
}
