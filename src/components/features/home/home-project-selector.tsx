import { useTranslation } from "react-i18next";
import { FolderKanban } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useConversationPanelPreferencesStore } from "#/stores/conversation-panel-preferences-store";
import { useProjectRegistryStore } from "#/stores/project-registry-store";
import { PROJECT_FILTER_ALL } from "#/utils/project";
import { cn } from "#/utils/utils";

const EMPTY_PROJECTS = [] as const;

/**
 * Compact launcher control for the active project. The selection is the single
 * active project: it filters the conversation list AND seeds new launches with
 * `tags.project` (see `getActiveProjectSlug`). Surfacing it here makes it
 * visible at launch time so a project-scoped launch is never a surprise.
 *
 * Selection only — projects are created/deleted in the sidebar filter menu's
 * "Manage projects" dialog. Hidden when there are no projects and none is
 * active (nothing to choose).
 */
export function HomeProjectSelector() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const projects = useProjectRegistryStore(
    (state) => state.projectsByBackendId[backend.id] ?? EMPTY_PROJECTS,
  );
  const projectFilter = useConversationPanelPreferencesStore(
    (state) => state.projectFilter,
  );
  const setProjectFilter = useConversationPanelPreferencesStore(
    (state) => state.setProjectFilter,
  );

  const hasActiveForeignSlug =
    projectFilter !== PROJECT_FILTER_ALL &&
    !projects.some((project) => project.slug === projectFilter);

  // Nothing to pick between: no registry projects and no active project.
  if (projects.length === 0 && !hasActiveForeignSlug) {
    return null;
  }

  return (
    <label
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-2 py-1 text-xs text-[var(--oh-muted)]",
        projectFilter !== PROJECT_FILTER_ALL && "text-foreground",
      )}
    >
      <FolderKanban className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{t(I18nKey.CONVERSATION_PANEL$PROJECT)}</span>
      <select
        data-testid="home-project-selector"
        aria-label={t(I18nKey.CONVERSATION_PANEL$PROJECT)}
        value={projectFilter}
        onChange={(event) => setProjectFilter(event.target.value)}
        className="max-w-[160px] cursor-pointer truncate bg-transparent text-inherit focus:outline-none"
      >
        <option value={PROJECT_FILTER_ALL}>
          {t(I18nKey.CONVERSATION_PANEL$NO_PROJECT)}
        </option>
        {projects.map((project) => (
          <option key={project.slug} value={project.slug}>
            {project.name}
          </option>
        ))}
        {hasActiveForeignSlug ? (
          <option value={projectFilter}>{projectFilter}</option>
        ) : null}
      </select>
    </label>
  );
}
