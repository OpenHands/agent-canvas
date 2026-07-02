import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import type { SectionDef, SectionId } from "./sections";

interface AgentProfileSectionNavProps {
  sections: SectionDef[];
  activeId: SectionId;
  onSelect: (id: SectionId) => void;
  /** Section ids with a validation error — flagged with a marker in the nav. */
  errorSections: Set<SectionId>;
}

/**
 * Vertical section nav for the master-detail profile editor. Kind-aware (the
 * caller passes only the sections that apply), highlights the active section,
 * and marks sections that have a blocking validation error.
 */
export function AgentProfileSectionNav({
  sections,
  activeId,
  onSelect,
  errorSections,
}: AgentProfileSectionNavProps) {
  const { t } = useTranslation("openhands");

  return (
    <nav
      aria-label={t(I18nKey.SETTINGS$AGENT_SECTIONS_NAV_LABEL)}
      className="flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-x-visible md:w-48 md:shrink-0"
      data-testid="agent-profile-section-nav"
    >
      {sections.map((section) => {
        const isActive = section.id === activeId;
        const hasError = errorSections.has(section.id);
        return (
          <button
            key={section.id}
            type="button"
            data-testid={`agent-profile-nav-${section.id}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(section.id)}
            className={cn(
              "flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors",
              isActive
                ? "bg-tertiary text-white"
                : "text-[#A3A3A3] hover:bg-tertiary/60 hover:text-white",
            )}
          >
            <span>{t(section.labelKey)}</span>
            {hasError && (
              <span
                aria-hidden
                data-testid={`agent-profile-nav-${section.id}-error`}
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
