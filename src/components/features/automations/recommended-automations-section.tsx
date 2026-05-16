import { Clock3, Sparkles, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { RecommendedAutomation } from "#/constants/recommended-automations";
import { getRecommendedAutomationsByPopularity } from "#/constants/recommended-automations";
import { MCP_MARKETPLACE, MarketplaceEntry } from "#/constants/mcp-marketplace";
import { McpLogoBadge } from "#/components/features/mcp-logo-badge";
import { MCPServerConfig } from "#/types/mcp-server";
import {
  findInstalledMatch,
  getMarketplaceEntryById,
  isMarketplaceEntryAvailable,
} from "#/utils/mcp-marketplace-utils";
import { cn } from "#/utils/utils";

interface RecommendedAutomationsSectionProps {
  backendKind: "local" | "cloud";
  installedServers: MCPServerConfig[];
  query?: string;
  onSelect: (automation: RecommendedAutomation) => void;
}

function getRequiredEntries(automation: RecommendedAutomation) {
  return automation.requiredMcpIds
    .map((id) => getMarketplaceEntryById(id, MCP_MARKETPLACE))
    .filter((entry): entry is MarketplaceEntry => !!entry);
}

function automationMatchesQuery(
  automation: RecommendedAutomation,
  entries: MarketplaceEntry[],
  rawQuery: string,
) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    automation.name,
    automation.category,
    automation.description,
    automation.prompt,
    ...entries.map((entry) => entry.name),
    ...entries.flatMap((entry) => entry.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function isAutomationAvailable(
  automation: RecommendedAutomation,
  backendKind: "local" | "cloud",
) {
  return getRequiredEntries(automation).every((entry) =>
    isMarketplaceEntryAvailable(entry, backendKind),
  );
}

export function RecommendedAutomationsSection({
  backendKind,
  installedServers,
  query = "",
  onSelect,
}: RecommendedAutomationsSectionProps) {
  const { t } = useTranslation("openhands");

  const visibleAutomations = getRecommendedAutomationsByPopularity().filter(
    (automation) => {
      const requiredEntries = getRequiredEntries(automation);
      return (
        isAutomationAvailable(automation, backendKind) &&
        automationMatchesQuery(automation, requiredEntries, query)
      );
    },
  );

  if (visibleAutomations.length === 0) return null;

  return (
    <section
      data-testid="recommended-automations-section"
      className="overflow-hidden rounded-2xl border border-[var(--oh-border)] bg-base-secondary"
    >
      <div className="relative px-5 py-4 border-b border-[var(--oh-border)]">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(137,255,179,0.14),transparent_30%),linear-gradient(120deg,rgba(255,255,255,0.04),transparent)]"
        />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-[0.2em]">
              <Sparkles className="h-3.5 w-3.5" />
              {t(I18nKey.RECOMMENDED_AUTOMATIONS$SECTION_LABEL)}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-content">
              {t(I18nKey.RECOMMENDED_AUTOMATIONS$SECTION_TITLE)}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {t(I18nKey.RECOMMENDED_AUTOMATIONS$SECTION_DESCRIPTION)}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary">
            <Wand2 className="h-3.5 w-3.5" />
            {t(I18nKey.RECOMMENDED_AUTOMATIONS$POPULARITY_SORTED)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2">
        {visibleAutomations.map((automation) => {
          const requiredEntries = getRequiredEntries(automation);
          const missingCount = requiredEntries.filter(
            (entry) => !findInstalledMatch(entry.template, installedServers),
          ).length;

          return (
            <button
              key={automation.id}
              type="button"
              data-testid={`recommended-automation-card-${automation.id}`}
              onClick={() => onSelect(automation)}
              className={cn(
                "group flex h-full flex-col gap-4 rounded-xl border border-[var(--oh-border)]",
                "bg-[var(--oh-surface)] p-4 text-left transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-raised",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
                    {automation.category}
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-content">
                    {automation.name}
                  </h3>
                </div>
                <div className="flex -space-x-1.5" aria-hidden="true">
                  {requiredEntries.map((entry) => (
                    <McpLogoBadge
                      key={entry.id}
                      entry={entry}
                      size="sm"
                      className="ring-2 ring-[var(--oh-surface)]"
                    />
                  ))}
                </div>
              </div>

              <p className="text-xs leading-5 text-content-2">
                {automation.description}
              </p>

              <div className="mt-auto flex flex-wrap items-center gap-2">
                {requiredEntries.map((entry) => {
                  const installed = !!findInstalledMatch(
                    entry.template,
                    installedServers,
                  );
                  return (
                    <span
                      key={entry.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]",
                        installed
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-[var(--oh-border)] bg-base-secondary text-muted",
                      )}
                    >
                      <McpLogoBadge entry={entry} size="sm" />
                      {entry.name}
                    </span>
                  );
                })}
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted">
                  <Clock3 className="h-3.5 w-3.5" />
                  {t(I18nKey.RECOMMENDED_AUTOMATIONS$MINUTES, {
                    count: automation.estimatedSetupMinutes,
                  })}
                </span>
              </div>

              {missingCount > 0 && (
                <p className="text-[11px] text-tertiary-alt">
                  {t(I18nKey.RECOMMENDED_AUTOMATIONS$MISSING_CONNECT, {
                    count: missingCount,
                  })}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
