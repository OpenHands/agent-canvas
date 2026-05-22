import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { LocalWorkspace } from "#/types/workspace";
import { useUserProviders } from "#/hooks/use-user-providers";
import { WorkspaceSelectionForm } from "./workspace-selection-form";

const ICON_BUTTON_CLASS =
  "rounded-md p-1 text-white hover:bg-tertiary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed";

interface OpenWorkspaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (workspace: LocalWorkspace) => void;
}

export function OpenWorkspaceDialog({
  isOpen,
  onClose,
  onConfirm,
}: OpenWorkspaceDialogProps) {
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
          <BaseModalTitle title={t(I18nKey.HOME$OPEN_WORKSPACE)} />
          <button
            type="button"
            onClick={onClose}
            className={cn(ICON_BUTTON_CLASS, "shrink-0")}
            data-testid="close-open-workspace-dialog"
            aria-label={t(I18nKey.BUTTON$CLOSE)}
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="w-full" data-testid="open-workspace-dialog-body">
          <WorkspaceSelectionForm
            isLoadingSettings={isLoadingSettings}
            onConfirm={(workspace) => {
              onConfirm(workspace);
              onClose();
            }}
          />
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}
