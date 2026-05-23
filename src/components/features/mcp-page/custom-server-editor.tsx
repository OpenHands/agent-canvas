import React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { MODAL_ICON_BUTTON_CLASS } from "#/components/shared/modals/modal-icon-button-class";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { MCPServerForm } from "#/components/features/settings/mcp-settings/mcp-server-form";
import { cn } from "#/utils/utils";
import { useAddMcpServer } from "#/hooks/mutation/use-add-mcp-server";
import { useUpdateMcpServer } from "#/hooks/mutation/use-update-mcp-server";
import { useDeleteMcpServer } from "#/hooks/mutation/use-delete-mcp-server";
import { MCPServerConfig } from "#/types/mcp-server";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

interface CustomServerEditorProps {
  server: MCPServerConfig;
  existingServers: MCPServerConfig[];
  onClose: () => void;
}

/**
 * Modal wrapper around `MCPServerForm` so users can hand-author
 * arbitrary stdio / SSE / SHTTP entries without reaching for raw JSON.
 * An empty `server.id` means "Add new".
 */
export function CustomServerEditor({
  server,
  existingServers,
  onClose,
}: CustomServerEditorProps) {
  const { t } = useTranslation("openhands");
  const { mutate: addMcpServer, isPending: isAdding } = useAddMcpServer();
  const { mutate: updateMcpServer, isPending: isUpdating } =
    useUpdateMcpServer();
  const { mutate: deleteMcpServer, isPending: isDeleting } =
    useDeleteMcpServer();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const isEditing = !!server.id;
  const isPending = isAdding || isUpdating || isDeleting;
  const isDismissBlocked = isPending || showDeleteConfirm;

  // Shared error handler so both add and update surface backend errors
  // as a toast instead of failing silently — previously these calls
  // had no `onError` and the modal closed even on a 4xx/5xx, leaving
  // the user to discover the failure on the next page load.
  const handleError = (err: unknown) => {
    const message = retrieveAxiosErrorMessage(err as AxiosError);
    displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
  };

  const handleSubmit = (payload: MCPServerConfig) => {
    if (isEditing) {
      updateMcpServer(
        { serverId: server.id, server: payload },
        { onSuccess: onClose, onError: handleError },
      );
    } else {
      addMcpServer(payload, { onSuccess: onClose, onError: handleError });
    }
  };

  const handleConfirmDelete = () => {
    deleteMcpServer(server, {
      onSuccess: () => {
        displaySuccessToast(t(I18nKey.MCP$REMOVE_SUCCESS));
        setShowDeleteConfirm(false);
        onClose();
      },
      onError: (err) => {
        handleError(err);
        setShowDeleteConfirm(false);
      },
    });
  };

  return (
    <>
      <ModalBackdrop
        // Block backdrop-click / Escape from dismissing the modal while
        // a mutation is in flight — closing mid-request would orphan
        // the request and leave the user with no error feedback.
        onClose={isDismissBlocked ? undefined : onClose}
        closeOnEscape={!isDismissBlocked}
        aria-label={
          isEditing
            ? t(I18nKey.MCP$EDIT_CUSTOM_TITLE)
            : t(I18nKey.MCP$ADD_CUSTOM_TITLE)
        }
      >
        <div
          data-testid="mcp-custom-editor"
          className="bg-base-secondary p-6 rounded-xl border border-[var(--oh-border)] w-[520px] max-w-[90vw] max-h-[90vh] overflow-y-auto custom-scrollbar"
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-white">
              {isEditing
                ? t(I18nKey.MCP$EDIT_CUSTOM_TITLE)
                : t(I18nKey.MCP$ADD_CUSTOM_TITLE)}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isDismissBlocked}
              className={cn(MODAL_ICON_BUTTON_CLASS, "shrink-0")}
              data-testid="mcp-custom-editor-close"
              aria-label={t(I18nKey.BUTTON$CLOSE)}
            >
              <X size={20} aria-hidden />
            </button>
          </div>
          <MCPServerForm
            mode={isEditing ? "edit" : "add"}
            server={isEditing ? server : undefined}
            existingServers={existingServers}
            onSubmit={handleSubmit}
            onCancel={onClose}
            onDelete={isEditing ? () => setShowDeleteConfirm(true) : undefined}
            isActionDisabled={isPending}
          />
        </div>
      </ModalBackdrop>

      {showDeleteConfirm ? (
        <ConfirmationModal
          text={t(I18nKey.SETTINGS$MCP_CONFIRM_DELETE)}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleConfirmDelete}
          isConfirming={isDeleting}
        />
      ) : null}
    </>
  );
}
