import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
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
    <div data-testid="skills-toolbar" className="flex flex-col gap-6">
      <div
        className={cn(
          "relative flex items-center w-1/2",
          "rounded-lg border border-[var(--oh-border)] bg-base-secondary",
          "focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/20",
          "transition-colors",
        )}
      >
        <Search
          className="ml-3 h-4 w-4 text-tertiary-alt shrink-0"
          aria-hidden
        />
        <input
          data-testid="skills-search-input"
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t(I18nKey.SETTINGS$SKILLS_SEARCH_PLACEHOLDER)}
          aria-label={t(I18nKey.SETTINGS$SKILLS_SEARCH_PLACEHOLDER)}
          className={cn(
            "flex-1 min-w-0 bg-transparent border-0 outline-none",
            "px-3 py-2 text-sm placeholder:text-tertiary-alt",
            "[&::-webkit-search-cancel-button]:hidden",
          )}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="mr-2 p-1 rounded text-tertiary-alt hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
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
                    ? "border-white/60 bg-white/10 text-white"
                    : "border-[var(--oh-border)] bg-transparent text-tertiary-light hover:border-[var(--cool-grey-500)] hover:text-white",
                )}
              >
                {t(FILTER_LABEL_KEY[option])}
              </button>
            );
          })}
        </div>

        <span
          data-testid="skills-count"
          className="text-xs text-tertiary-light whitespace-nowrap pr-2"
        >
          {t(I18nKey.SETTINGS$SKILLS_COUNT, { shown, total })}
        </span>
      </div>
    </div>
  );
}
