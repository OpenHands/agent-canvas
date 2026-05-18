import React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { MCPServerForm } from "#/components/features/settings/mcp-settings/mcp-server-form";
import { useAddMcpServer } from "#/hooks/mutation/use-add-mcp-server";
import { useUpdateMcpServer } from "#/hooks/mutation/use-update-mcp-server";
import { MCPServerConfig } from "#/types/mcp-server";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

interface CustomServerEditorProps {
  server: MCPServerConfig;
  existingServers: MCPServerConfig[];
  onClose: () => void;
}

/**
 * Modal wrapper around the legacy `MCPServerForm` so power users can
 * still hand-author arbitrary stdio / SSE / SHTTP entries without
 * reaching for raw JSON. An empty `server.id` means "Add new".
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
        className="bg-base-secondary p-6 rounded-xl border border-[var(--oh-border)] w-[680px] max-w-[90vw] max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <h2 className="text-lg font-semibold mb-4">
          {isEditing
            ? t(I18nKey.MCP$EDIT_CUSTOM_TITLE)
            : t(I18nKey.MCP$ADD_CUSTOM_TITLE)}
        </h2>
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
