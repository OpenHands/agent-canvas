import React from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { cn } from "#/utils/utils";
import {
  SKILL_TYPE_FILTER_OPTIONS,
  type SkillTypeFilter,
} from "./skill-type-filter";

const FILTER_LABEL_KEY: Record<SkillTypeFilter, I18nKey> = {
  all: I18nKey.SETTINGS$SKILLS_TYPE_ALL,
  agentskills: I18nKey.SETTINGS$SKILLS_TYPE_AGENTSKILLS,
  knowledge: I18nKey.SETTINGS$SKILLS_TYPE_KNOWLEDGE,
  repo: I18nKey.SETTINGS$SKILLS_TYPE_REPO,
};

interface SkillsTypeFilterDropdownProps {
  value: SkillTypeFilter;
  onChange: (filter: SkillTypeFilter) => void;
}

export function SkillsTypeFilterDropdown({
  value,
  onChange,
}: SkillsTypeFilterDropdownProps) {
  const { t } = useTranslation("openhands");
  const [open, setOpen] = React.useState(false);
  const containerRef = useClickOutsideElement<HTMLDivElement>(() =>
    setOpen(false),
  );

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
      data-testid="skills-type-filter"
    >
      <button
        type="button"
        data-testid="skills-type-filter-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(I18nKey.CONVERSATION_PANEL$FILTER_LABEL)}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
          "border-[var(--oh-border)] bg-base-secondary text-white",
          "hover:border-[var(--cool-grey-500)]",
          value !== "all" && "border-white/60 bg-white/10",
        )}
      >
        <span className="max-w-[9rem] truncate">
          {t(FILTER_LABEL_KEY[value])}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-tertiary-alt transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          data-testid="skills-type-filter-menu"
          aria-label={t(I18nKey.CONVERSATION_PANEL$FILTER_LABEL)}
          className={cn(
            "absolute right-0 top-full z-50 mt-1 min-w-full",
            "rounded-md border border-[var(--oh-border-subtle)] bg-tertiary py-1 shadow-lg",
          )}
        >
          {SKILL_TYPE_FILTER_OPTIONS.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                data-testid={`skills-type-filter-${option}`}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white",
                  "hover:bg-[var(--oh-interactive-hover)] cursor-pointer",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {t(FILTER_LABEL_KEY[option])}
                </span>
                {selected ? (
                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
