import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { Branch, GitRepository } from "#/types/git";
import { Provider } from "#/types/settings";
import { useUserProviders } from "#/hooks/use-user-providers";
import { MODAL_ICON_BUTTON_CLASS } from "#/components/shared/modals/modal-icon-button-class";
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
        width="sm"
        className="items-start border border-[var(--oh-border)] !gap-4"
      >
        <div className="flex w-full items-start justify-between gap-4">
          <BaseModalTitle title={t(I18nKey.COMMON$OPEN_REPOSITORY)} />
          <button
            type="button"
            onClick={onClose}
            className={cn(MODAL_ICON_BUTTON_CLASS, "shrink-0")}
            data-testid="close-open-repository-dialog"
            aria-label={t(I18nKey.BUTTON$CLOSE)}
          >
            <X size={20} aria-hidden />
          </button>
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
