import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  AUTOMATION_CATALOG,
  type RecommendedAutomation,
} from "@openhands/extensions/automations";
import {
  MCP_CATALOG as MCP_MARKETPLACE,
  type McpCatalogEntry as MarketplaceEntry,
} from "@openhands/extensions/mcps";
import { McpLogoBadge } from "#/components/features/mcp-logo-badge";
import { MCPServerConfig } from "#/types/mcp-server";
import {
  findInstalledMatch,
  getMarketplaceEntryById,
  isMarketplaceEntryAvailable,
} from "#/utils/mcp-marketplace-utils";
import ClockIcon from "#/icons/clock.svg?react";
import { StatusBadge } from "./status-badge";

interface RecommendedAutomationsSectionProps {
  backendKind: "local" | "cloud";
  installedServers: MCPServerConfig[];
  query?: string;
  onSelect: (automation: RecommendedAutomation) => void;
}

export function getAutomationsByPopularity(
  catalog: RecommendedAutomation[],
): RecommendedAutomation[] {
  return catalog
    .map((automation, index) => ({ automation, index }))
    .sort((a, b) => {
      const byPopularity =
        (b.automation.popularityRank ?? 0) - (a.automation.popularityRank ?? 0);
      return byPopularity || a.index - b.index;
    })
    .map(({ automation }) => automation);
}

const RECOMMENDED_AUTOMATIONS = getAutomationsByPopularity(AUTOMATION_CATALOG);

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

  const visibleAutomations = RECOMMENDED_AUTOMATIONS.filter((automation) => {
    const requiredEntries = getRequiredEntries(automation);
    return (
      isAutomationAvailable(automation, backendKind) &&
      automationMatchesQuery(automation, requiredEntries, query)
    );
  });

  if (visibleAutomations.length === 0) return null;

  return (
    <section data-testid="recommended-automations-section">
      <div className="flex items-center">
        <h2 className="text-sm font-semibold text-white">
          {t(I18nKey.RECOMMENDED_AUTOMATIONS$SECTION_TITLE)}
        </h2>
        <StatusBadge count={visibleAutomations.length} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {t(I18nKey.RECOMMENDED_AUTOMATIONS$SECTION_DESCRIPTION)}
      </p>

      <div className="mt-3 flex flex-col gap-3">
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
              className="cursor-pointer rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-5 text-left transition-colors hover:border-[var(--oh-border)] focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-muted">
                    {automation.category}
                  </div>
                  <h3 className="mt-1 truncate text-base font-semibold text-white">
                    {automation.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {automation.description}
                  </p>
                </div>
                <div className="flex shrink-0 -space-x-1" aria-hidden="true">
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

              <div className="mt-3 flex flex-wrap gap-2">
                {requiredEntries.map((entry) => {
                  const installed = !!findInstalledMatch(
                    entry.template,
                    installedServers,
                  );
                  return (
                    <span
                      key={entry.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--oh-border)] px-3 py-1 text-xs text-muted"
                    >
                      <McpLogoBadge entry={entry} size="sm" />
                      {entry.name}
                      {installed && (
                        <span className="text-primary">
                          {t(I18nKey.RECOMMENDED_AUTOMATIONS$CONNECTED)}
                        </span>
                      )}
                    </span>
                  );
                })}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--oh-border)] px-3 py-1 text-xs text-muted">
                  <ClockIcon className="size-3.5" />
                  {t(I18nKey.RECOMMENDED_AUTOMATIONS$MINUTES, {
                    count: automation.estimatedSetupMinutes,
                  })}
                </span>
              </div>

              {missingCount > 0 && (
                <p className="mt-3 text-xs text-muted">
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
