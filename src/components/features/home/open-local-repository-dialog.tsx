import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { I18nKey } from "#/i18n/declaration";
import { LocalWorkspace } from "#/types/workspace";
import { cloneLocalRepository } from "#/api/git-service/clone-local-repository";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";
import {
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
} from "#/utils/form-control-classes";

interface OpenLocalRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (workspace: LocalWorkspace) => void;
}

const inputClassName = cn(
  "w-full rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-tertiary",
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
);

/**
 * Local-backend counterpart to {@link OpenRepositoryDialog}. Local
 * agent-servers cannot browse a Git provider's repositories (that API is
 * cloud-only), so the user supplies a repo reference (owner/repo or a clone
 * URL) and we clone it into a managed workspace directory via the runtime's
 * bash endpoint — then open a conversation scoped to the cloned directory.
 *
 * Implements OpenHands/agent-canvas#976 for Local backend mode.
 */
export function OpenLocalRepositoryDialog({
  isOpen,
  onClose,
  onConfirm,
}: OpenLocalRepositoryDialogProps) {
  const { t } = useTranslation("openhands");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  if (!isOpen) return null;

  const canSubmit = repo.trim().length > 0 && !isCloning;

  const handleClone = async () => {
    if (!canSubmit) return;
    setIsCloning(true);
    try {
      const { path, name } = await cloneLocalRepository(repo, branch);
      onConfirm({ id: path, name, path });
      setRepo("");
      setBranch("");
      onClose();
    } catch (error) {
      displayErrorToast(
        error instanceof Error ? error.message : t(I18nKey.HOME$CLONE_FAILED),
      );
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <ModalBackdrop onClose={isCloning ? () => {} : onClose}>
      <ModalBody
        width="sm"
        className="relative items-start border border-[var(--oh-border)] !gap-4"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="close-open-local-repository-dialog"
        />
        <div className="w-full pr-6">
          <BaseModalTitle title={t(I18nKey.COMMON$OPEN_REPOSITORY)} />
        </div>

        <div
          className="flex w-full flex-col gap-3"
          data-testid="open-local-repository-dialog-body"
        >
          <p className="text-sm text-tertiary">
            {t(I18nKey.HOME$OPEN_REPOSITORY_HELP)}
          </p>

          <input
            data-testid="local-repo-input"
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleClone();
            }}
            placeholder={t(I18nKey.HOME$REPO_URL_PLACEHOLDER)}
            disabled={isCloning}
            className={inputClassName}
          />

          <input
            data-testid="local-repo-branch-input"
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleClone();
            }}
            placeholder={t(I18nKey.HOME$REPO_BRANCH_PLACEHOLDER)}
            disabled={isCloning}
            className={inputClassName}
          />

          <button
            type="button"
            data-testid="clone-and-open-button"
            onClick={handleClone}
            disabled={!canSubmit}
            className={cn(
              "flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-white",
              formControlBorderClassName,
              formControlTransitionClassName,
              canSubmit
                ? "cursor-pointer bg-primary hover:opacity-90"
                : "cursor-not-allowed opacity-50",
            )}
          >
            {isCloning
              ? t(I18nKey.HOME$CLONING_REPOSITORY)
              : t(I18nKey.HOME$CLONE_AND_OPEN)}
          </button>
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}
