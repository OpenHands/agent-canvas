import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

interface MarketplaceSearchProps {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Single search input that filters both the Installed and Marketplace
 * sections on the MCP page.
 */
export function MarketplaceSearch({ value, onChange }: MarketplaceSearchProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="mcp-search"
      className={cn(
        "relative flex items-center w-1/2",
        "rounded-lg border border-[var(--oh-border)] bg-base-secondary",
        "focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/20",
        "transition-colors",
      )}
    >
      <Search
        className="ml-3 h-4 w-4 text-tertiary-alt shrink-0"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(I18nKey.MCP$SEARCH_PLACEHOLDER)}
        aria-label={t(I18nKey.MCP$SEARCH_PLACEHOLDER)}
        data-testid="mcp-search-input"
        className={cn(
          "flex-1 min-w-0 bg-transparent border-0 outline-none",
          "px-3 py-2 text-sm placeholder:text-tertiary-alt",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t(I18nKey.MCP$SEARCH_CLEAR)}
          data-testid="mcp-search-clear"
          className="mr-2 p-1 rounded text-tertiary-alt hover:text-content-1 cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
