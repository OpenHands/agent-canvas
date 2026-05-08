import React from "react";
import { useTranslation } from "react-i18next";

import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useNavigation } from "#/context/navigation-context";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useWorkspacesStore } from "#/stores/workspaces-store";
import { LocalWorkspace } from "#/types/workspace";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import FolderIcon from "#/icons/folder.svg?react";
import TrashIcon from "#/icons/trash.svg?react";
import PlusIcon from "#/icons/plus.svg?react";

import { FolderBrowserModal } from "./workspace-dropdown/folder-browser-modal";

interface WorkspaceSelectionFormProps {
  isLoadingSettings?: boolean;
}

export function WorkspaceSelectionForm({
  isLoadingSettings = false,
}: WorkspaceSelectionFormProps) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();

  const { workspaces, addWorkspaces, removeWorkspace } = useWorkspacesStore();
  const [isBrowserOpen, setIsBrowserOpen] = React.useState(false);
  const [launchingPath, setLaunchingPath] = React.useState<string | null>(null);

  const {
    mutate: createConversation,
    isPending,
    isSuccess,
  } = useCreateConversation();
  const isCreatingConversationElsewhere = useIsCreatingConversation();
  const isCreatingConversation =
    isPending || isSuccess || isCreatingConversationElsewhere;

  const handleLaunch = (workspace: LocalWorkspace) => {
    if (isCreatingConversation || isLoadingSettings) return;
    setLaunchingPath(workspace.path);
    createConversation(
      { workingDir: workspace.path },
      {
        onSuccess: (data) => navigate(`/conversations/${data.conversation_id}`),
      },
    );
  };

  return (
    <div className="flex flex-col w-full max-w-[500px]">
      {workspaces.length === 0 ? (
        <p className="text-sm text-[#A3A3A3] py-4">
          {t(I18nKey.HOME$NO_WORKSPACES)}
        </p>
      ) : (
        <ul
          className="flex flex-col gap-1 max-h-[180px] overflow-y-auto custom-scrollbar-always py-1"
          data-testid="workspace-list"
        >
          {workspaces.map((ws) => {
            const isLaunching =
              isCreatingConversation && launchingPath === ws.path;
            return (
              <li key={ws.path}>
                <div
                  className={cn(
                    "group flex items-center gap-2 px-3 py-2 rounded-lg",
                    "hover:bg-[#2F3137] transition-colors",
                    isLaunching && "opacity-60 pointer-events-none",
                  )}
                >
                  <button
                    type="button"
                    data-testid={`workspace-item-${ws.name}`}
                    onClick={() => handleLaunch(ws)}
                    disabled={isCreatingConversation || isLoadingSettings}
                    className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer disabled:cursor-not-allowed text-left"
                    title={`${ws.name}\n${ws.path}`}
                  >
                    <FolderIcon
                      width={18}
                      height={18}
                      className="shrink-0 text-[#A3A3A3]"
                    />
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-sm text-white truncate"
                        title={ws.name}
                      >
                        {ws.name}
                      </span>
                      <span className="text-[11px] text-[#71767F]">
                        {t(I18nKey.HOME$LOCAL_FOLDER_TOOLTIP)}
                      </span>
                      <span
                        className="text-xs text-[#A3A3A3] truncate"
                        title={ws.path}
                      >
                        {ws.path}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    data-testid={`workspace-remove-${ws.name}`}
                    onClick={() => removeWorkspace(ws.path)}
                    className={cn(
                      "p-1 rounded opacity-0 group-hover:opacity-100",
                      "hover:bg-[#5C5D62] transition-opacity cursor-pointer",
                      "text-[#A3A3A3] hover:text-white",
                    )}
                    aria-label={t(I18nKey.HOME$REMOVE_WORKSPACE)}
                    title={t(I18nKey.HOME$REMOVE_WORKSPACE)}
                  >
                    <TrashIcon width={14} height={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        data-testid="add-workspace-button"
        onClick={() => setIsBrowserOpen(true)}
        disabled={isLoadingSettings}
        className={cn(
          "flex items-center gap-2 px-3 py-2 mt-1 rounded-lg",
          "text-sm text-[#A3A3A3] hover:text-white hover:bg-[#2F3137]",
          "transition-colors cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <PlusIcon width={16} height={16} className="shrink-0" />
        {t(I18nKey.HOME$ADD_FOLDER)}
      </button>

      <FolderBrowserModal
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        onAdd={(item) => addWorkspaces([item])}
      />
    </div>
  );
}
