import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { I18nKey } from "#/i18n/declaration";
import RepoForkedIcon from "#/icons/repo-forked.svg?react";
import { Branch, GitRepository } from "#/types/git";
import { Provider } from "#/types/settings";
import { useUserProviders } from "#/hooks/use-user-providers";
import { RepositorySelectionForm } from "./repo-selection-form";

interface OpenRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: {
    repository: GitRepository;
    branch: Branch;
    provider: Provider | null;
  }) => void;
}

export function OpenRepositoryDialog({
  isOpen,
  onClose,
  onConfirm,
}: OpenRepositoryDialogProps) {
  const { t } = useTranslation("openhands");
  const { isLoadingSettings } = useUserProviders();

  if (!isOpen) return null;

  return (
    <ModalBackdrop onClose={onClose}>
      <ModalBody
        width="small"
        className="items-start border border-[var(--oh-border)] !gap-4"
      >
        <div className="flex items-center gap-[10px]">
          <RepoForkedIcon width={24} height={24} />
          <BaseModalTitle title={t(I18nKey.COMMON$OPEN_REPOSITORY)} />
        </div>

        <div className="w-full" data-testid="open-repository-dialog-body">
          <RepositorySelectionForm
            isLoadingSettings={isLoadingSettings}
            onConfirm={(selection) => {
              onConfirm(selection);
              onClose();
            }}
          />
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}
