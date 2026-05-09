import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { MCPServerForm } from "#/components/features/settings/mcp-settings/mcp-server-form";
import { useAddMcpServer } from "#/hooks/mutation/use-add-mcp-server";
import { useUpdateMcpServer } from "#/hooks/mutation/use-update-mcp-server";
import { MCPServerConfig } from "#/types/mcp-server";

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
  const { mutate: addMcpServer } = useAddMcpServer();
  const { mutate: updateMcpServer } = useUpdateMcpServer();

  const isEditing = !!server.id;

  return (
    <div
      data-testid="mcp-custom-editor"
      className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-6"
    >
      <div className="bg-base-secondary p-6 rounded-xl border border-tertiary w-[680px] max-w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h2 className="text-lg font-semibold mb-4">
          {isEditing
            ? t(I18nKey.MCP$EDIT_CUSTOM_TITLE)
            : t(I18nKey.MCP$ADD_CUSTOM_TITLE)}
        </h2>
        <MCPServerForm
          mode={isEditing ? "edit" : "add"}
          server={isEditing ? server : undefined}
          existingServers={existingServers}
          onSubmit={(payload) => {
            if (isEditing) {
              updateMcpServer(
                { serverId: server.id, server: payload },
                { onSuccess: onClose },
              );
            } else {
              addMcpServer(payload, { onSuccess: onClose });
            }
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
