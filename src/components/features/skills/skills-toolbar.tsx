import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import SearchIcon from "#/icons/search.svg?react";
import {
  SKILL_TYPE_FILTER_OPTIONS,
  type SkillTypeFilter,
} from "./skill-type-filter";

interface SkillsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: SkillTypeFilter;
  onTypeFilterChange: (filter: SkillTypeFilter) => void;
  shown: number;
  total: number;
}

const FILTER_LABEL_KEY: Record<SkillTypeFilter, I18nKey> = {
  all: I18nKey.SETTINGS$SKILLS_TYPE_ALL,
  agentskills: I18nKey.SETTINGS$SKILLS_TYPE_AGENTSKILLS,
  knowledge: I18nKey.SETTINGS$SKILLS_TYPE_KNOWLEDGE,
  repo: I18nKey.SETTINGS$SKILLS_TYPE_REPO,
};

export function SkillsToolbar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  shown,
  total,
}: SkillsToolbarProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="skills-toolbar"
      className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4"
    >
      <div className="relative flex-1 lg:max-w-md">
        <SearchIcon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-content-muted"
          aria-hidden
        />
        <input
          data-testid="skills-search-input"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t(I18nKey.SETTINGS$SKILLS_SEARCH_PLACEHOLDER)}
          aria-label={t(I18nKey.SETTINGS$SKILLS_SEARCH_PLACEHOLDER)}
          className="w-full rounded-full border border-border bg-[rgba(31,31,31,0.6)] py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-content-muted focus:border-primary focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          data-testid="skills-type-filter"
          className="flex flex-wrap items-center gap-1.5"
        >
          {SKILL_TYPE_FILTER_OPTIONS.map((option) => {
            const active = option === typeFilter;
            return (
              <button
                key={option}
                type="button"
                data-testid={`skills-type-filter-${option}`}
                aria-pressed={active}
                onClick={() => onTypeFilterChange(option)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-transparent text-content-muted hover:border-border-hover hover:text-white",
                )}
              >
                {t(FILTER_LABEL_KEY[option])}
              </button>
            );
          })}
        </div>

        <span
          data-testid="skills-count"
          className="text-xs text-content-muted whitespace-nowrap pr-2"
        >
          {t(I18nKey.SETTINGS$SKILLS_COUNT, { shown, total })}
        </span>
      </div>
    </div>
  );
}
