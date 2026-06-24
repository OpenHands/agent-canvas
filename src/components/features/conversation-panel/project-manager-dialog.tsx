import React from "react";
import { useTranslation } from "react-i18next";
import { Folder, Trash2 } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Project, type ProjectInput } from "#/utils/project";

interface ProjectManagerDialogProps {
  projects: readonly Project[];
  /** Create/replace a project; returns the parsed project or null if invalid. */
  onCreate: (input: ProjectInput) => Project | null;
  onRemove: (slug: string) => void;
  /** Make a project the active one (filters the list + seeds new launches). */
  onActivate: (slug: string) => void;
  /** Advisory creator identity stamped on newly-created projects. */
  currentUserEmail: string | null;
  onClose: () => void;
}

/**
 * Create + manage the per-browser project registry. Intentionally thin (v1):
 * a project is a name for a slug plus optional linked repos. Creating a project
 * makes it the active one so the natural flow is create → launch into it.
 * Rename is deliberately omitted — the slug is the stable join key, so editing
 * the name is "create again with the same name" (upsert by slug).
 */
export function ProjectManagerDialog({
  projects,
  onCreate,
  onRemove,
  onActivate,
  currentUserEmail,
  onClose,
}: ProjectManagerDialogProps) {
  const { t } = useTranslation("openhands");
  const [name, setName] = React.useState("");
  const [reposText, setReposText] = React.useState("");

  const handleCreate = () => {
    const created = onCreate({
      name,
      repos: reposText.split(",").map((repo) => repo.trim()),
      createdBy: currentUserEmail,
    });
    if (!created) {
      return;
    }
    onActivate(created.slug);
    setName("");
    setReposText("");
  };

  // Gate Create on a name that actually yields a valid project so the button
  // never silently no-ops (a punctuation-only name, or one reserved as "all").
  const canCreate = Project.parse({ name }) !== null;

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.CONVERSATION_PANEL$MANAGE_PROJECTS)}
    >
      <ModalBody className="items-start border border-[var(--oh-border)] max-w-md w-full">
        <BaseModalTitle title={t(I18nKey.CONVERSATION_PANEL$MANAGE_PROJECTS)} />

        <form
          className="flex w-full flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate();
          }}
        >
          <SettingsInput
            testId="project-name-input"
            label={t(I18nKey.CONVERSATION_PANEL$PROJECT_NAME)}
            type="text"
            value={name}
            onChange={setName}
            className="w-full"
          />
          <SettingsInput
            testId="project-repos-input"
            label={t(I18nKey.COMMON$REPOSITORIES)}
            type="text"
            value={reposText}
            onChange={setReposText}
            placeholder={t(
              I18nKey.CONVERSATION_PANEL$PROJECT_REPOS_PLACEHOLDER,
            )}
            showOptionalTag
            className="w-full"
          />
          <BrandButton
            testId="project-create-button"
            type="submit"
            variant="primary"
            isDisabled={!canCreate}
          >
            {t(I18nKey.BUTTON$CREATE)}
          </BrandButton>
        </form>

        <div className="flex w-full flex-col gap-1">
          {projects.length === 0 ? (
            <p className="text-sm text-[var(--oh-muted)]">
              {t(I18nKey.CONVERSATION_PANEL$NO_PROJECTS_YET)}
            </p>
          ) : (
            projects.map((project) => (
              <div
                key={project.slug}
                data-testid={`project-row-${project.slug}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--oh-surface)]"
              >
                <Folder size={14} className="shrink-0 text-[var(--oh-muted)]" />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    onActivate(project.slug);
                    onClose();
                  }}
                >
                  <span className="block truncate text-sm text-foreground">
                    {project.name}
                  </span>
                  {project.repos.length > 0 ? (
                    <span className="block truncate text-xs text-[var(--oh-muted)]">
                      {project.repos.join(", ")}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  data-testid={`project-remove-${project.slug}`}
                  aria-label={t(I18nKey.BUTTON$DELETE)}
                  title={t(I18nKey.BUTTON$DELETE)}
                  className="shrink-0 rounded p-1 text-[var(--oh-muted)] hover:text-foreground"
                  onClick={() => onRemove(project.slug)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex w-full justify-end">
          <BrandButton
            testId="project-manager-close"
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            {t(I18nKey.BUTTON$CLOSE)}
          </BrandButton>
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}
