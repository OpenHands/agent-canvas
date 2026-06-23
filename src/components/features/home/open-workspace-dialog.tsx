import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { I18nKey } from "#/i18n/declaration";
import { LocalWorkspace } from "#/types/workspace";
import { useUserProviders } from "#/hooks/use-user-providers";
import { WorkspaceSelectionForm } from "./workspace-selection-form";
import { LocalRepositorySelectionForm } from "./local-repository-selection-form";

interface OpenWorkspaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (workspace: LocalWorkspace) => void;
  /**
   * Restrict the dialog to a single source. ``"repo"`` shows only the GitHub
   * repository picker, ``"workspace"`` only the local-folder picker. Omit to
   * show both sections (the home-screen default).
   */
  initialSource?: "repo" | "workspace";
}

export function OpenWorkspaceDialog({
  isOpen,
  onClose,
  onConfirm,
  initialSource,
}: OpenWorkspaceDialogProps) {
  const { t } = useTranslation("openhands");
  const { isLoadingSettings } = useUserProviders();

  if (!isOpen) return null;

  const showRepo = initialSource !== "workspace";
  const showWorkspace = initialSource !== "repo";

  return (
    <ModalBackdrop onClose={onClose}>
      <ModalBody
        width="sm"
        className="relative items-start border border-[var(--oh-border)] !gap-4"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="close-open-workspace-dialog"
        />
        <div className="w-full pr-6">
          <BaseModalTitle title={t(I18nKey.HOME$OPEN_LOCAL_SOURCE)} />
        </div>

        <div
          className="flex w-full flex-col gap-5"
          data-testid="open-workspace-dialog-body"
        >
          {showRepo ? (
            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t(I18nKey.HOME$OPEN_LOCAL_REPOSITORY_TITLE)}
                </h3>
                <p className="text-xs text-[var(--oh-text-secondary)]">
                  {t(I18nKey.HOME$OPEN_LOCAL_REPOSITORY_DESCRIPTION)}
                </p>
              </div>
              <LocalRepositorySelectionForm
                onConfirm={(workspace) => {
                  onConfirm(workspace);
                  onClose();
                }}
              />
            </section>
          ) : null}

          {showRepo && showWorkspace ? (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--oh-border)]" />
              <span className="text-xs text-[var(--oh-text-secondary)]">
                {t(I18nKey.COMMON$OR)}
              </span>
              <div className="h-px flex-1 bg-[var(--oh-border)]" />
            </div>
          ) : null}

          {showWorkspace ? (
            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t(I18nKey.HOME$OPEN_LOCAL_WORKSPACE_TITLE)}
                </h3>
                <p className="text-xs text-[var(--oh-text-secondary)]">
                  {t(I18nKey.HOME$OPEN_LOCAL_WORKSPACE_DESCRIPTION)}
                </p>
              </div>
              <WorkspaceSelectionForm
                isLoadingSettings={isLoadingSettings}
                onConfirm={(workspace) => {
                  onConfirm(workspace);
                  onClose();
                }}
              />
            </section>
          ) : null}
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}
