import React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { MCPServerForm } from "#/components/features/settings/mcp-settings/mcp-server-form";
import { useAddMcpServer } from "#/hooks/mutation/use-add-mcp-server";
import { useUpdateMcpServer } from "#/hooks/mutation/use-update-mcp-server";
import { MCPServerConfig } from "#/types/mcp-server";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { cn } from "#/utils/utils";

const ICON_BUTTON_CLASS =
  "rounded-md p-1 text-white hover:bg-tertiary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed";

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

  const isEditing = !!server.id;
  const isPending = isAdding || isUpdating;

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

  return (
    <ModalBackdrop
      // Block backdrop-click / Escape from dismissing the modal while
      // a mutation is in flight — closing mid-request would orphan
      // the request and leave the user with no error feedback.
      onClose={isPending ? undefined : onClose}
      closeOnEscape={!isPending}
      aria-label={
        isEditing
          ? t(I18nKey.MCP$EDIT_CUSTOM_TITLE)
          : t(I18nKey.MCP$ADD_CUSTOM_TITLE)
      }
    >
      <div
        data-testid="mcp-custom-editor"
        className={cn(
          "bg-base-secondary p-6 rounded-xl border border-[var(--oh-border)] max-h-[90vh] overflow-y-auto custom-scrollbar",
          modalWidthClassName("md"),
          MODAL_MAX_WIDTH_VIEWPORT,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <BaseModalTitle
            className="text-lg"
            title={
              isEditing
                ? t(I18nKey.MCP$EDIT_CUSTOM_TITLE)
                : t(I18nKey.MCP$ADD_CUSTOM_TITLE)
            }
          />
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className={ICON_BUTTON_CLASS}
            aria-label={t(I18nKey.BUTTON$CLOSE)}
            data-testid="close-mcp-custom-editor"
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
        />
      </div>
    </ModalBackdrop>
  );
}
