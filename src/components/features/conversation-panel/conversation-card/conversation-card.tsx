import React from "react";
import { usePostHog } from "posthog-js/react";
import { cn } from "#/utils/utils";
import { transformVSCodeUrl } from "#/utils/vscode-url-helper";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { RepositorySelection } from "#/api/open-hands.types";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { ConversationCardHeader } from "./conversation-card-header";
import { ConversationCardActions } from "./conversation-card-actions";
import { ConversationCardFooter } from "./conversation-card-footer";
import { useDownloadConversation } from "#/hooks/use-download-conversation";

interface ConversationCardProps {
  onClick?: () => void;
  onDelete?: () => void;
  onStop?: () => void;
  onChangeTitle?: (title: string) => void;
  showOptions?: boolean;
  title: string;
  selectedRepository: RepositorySelection | null;
  lastUpdatedAt: string;
  createdAt?: string;
  executionStatus?: ExecutionStatus | null;
  conversationId?: string;
  contextMenuOpen?: boolean;
  onContextMenuToggle?: (isOpen: boolean) => void;
  isActive?: boolean;
  workspaceWorkingDir?: string | null;
  showRepositoryMetadata?: boolean;
}

export function ConversationCard({
  onClick,
  onDelete,
  onStop,
  onChangeTitle,
  showOptions,
  title,
  selectedRepository,
  lastUpdatedAt,
  createdAt,
  conversationId,
  executionStatus,
  contextMenuOpen = false,
  onContextMenuToggle,
  isActive = false,
  workspaceWorkingDir,
  showRepositoryMetadata = true,
}: ConversationCardProps) {
  const posthog = usePostHog();
  const [titleMode, setTitleMode] = React.useState<"view" | "edit">("view");
  const { mutateAsync: downloadConversation } = useDownloadConversation();

  const onTitleSave = (newTitle: string) => {
    if (newTitle !== "" && newTitle !== title) {
      onChangeTitle?.(newTitle);
    }
    setTitleMode("view");
  };

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onDelete?.();
    onContextMenuToggle?.(false);
  };

  const handleStop = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onStop?.();
    onContextMenuToggle?.(false);
  };

  const handleEdit = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTitleMode("edit");
    onContextMenuToggle?.(false);
  };

  const handleDownloadViaVSCode = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    posthog.capture("download_via_vscode_button_clicked");

    // Fetch the VS Code URL from the API
    if (conversationId) {
      try {
        const data = await ConversationService.getVSCodeUrl(conversationId);
        if (data.vscode_url) {
          const transformedUrl = transformVSCodeUrl(data.vscode_url);
          if (transformedUrl) {
            window.open(transformedUrl, "_blank");
          }
        }
        // VS Code URL not available
      } catch {
        // Failed to fetch VS Code URL
      }
    }

    onContextMenuToggle?.(false);
  };

  const handleDownloadConversation = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (conversationId) {
      await downloadConversation(conversationId);
    }
    onContextMenuToggle?.(false);
  };

  const hasContextMenu = !!(onDelete || onChangeTitle || showOptions);
  const shouldRenderFooter = showRepositoryMetadata;

  return (
    <div
      data-testid="conversation-card"
      data-context-menu-open={contextMenuOpen.toString()}
      data-active={isActive ? "true" : "false"}
      onClick={onClick}
      className={cn(
        "group relative h-auto w-full rounded-md px-3 pt-1 pb-1 cursor-pointer transition-colors",
        "data-[context-menu-open=false]:hover:bg-[#1f2228]",
        "data-[active=true]:bg-[#25272D]",
        "data-[context-menu-open=true]:z-20",
      )}
    >
      <div className="flex items-center w-full min-w-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ConversationCardHeader
            title={title}
            titleMode={titleMode}
            onTitleSave={onTitleSave}
            executionStatus={executionStatus}
          />
        </div>

        <div className="relative ml-auto pl-2 flex items-center justify-end shrink-0">
          {(createdAt ?? lastUpdatedAt) && (
            <p
              className={cn(
                "text-xs text-[#A3A3A3] text-right whitespace-nowrap transition-opacity",
                hasContextMenu &&
                  "group-hover:opacity-0 group-focus-within:opacity-0",
                contextMenuOpen && "opacity-0",
              )}
            >
              <time>{formatTimeDelta(lastUpdatedAt ?? createdAt)}</time>
            </p>
          )}

          {hasContextMenu && (
            <div
              className={cn(
                "absolute right-0 top-1/2 -translate-y-1/2 transition-opacity",
                "opacity-0 invisible group-hover:opacity-100 group-hover:visible",
                contextMenuOpen && "opacity-100 visible z-[60]",
              )}
            >
              <ConversationCardActions
                contextMenuOpen={contextMenuOpen}
                onContextMenuToggle={onContextMenuToggle || (() => {})}
                onDelete={onDelete && handleDelete}
                onStop={onStop && handleStop}
                onEdit={onChangeTitle && handleEdit}
                onDownloadViaVSCode={handleDownloadViaVSCode}
                onDownloadConversation={handleDownloadConversation}
                executionStatus={executionStatus}
                conversationId={conversationId}
                showOptions={showOptions}
              />
            </div>
          )}
        </div>
      </div>

      {shouldRenderFooter && (
        <ConversationCardFooter
          selectedRepository={selectedRepository}
          lastUpdatedAt={lastUpdatedAt}
          createdAt={createdAt}
          executionStatus={executionStatus}
          workspaceWorkingDir={workspaceWorkingDir}
          showRepositoryMetadata={showRepositoryMetadata}
          showTimestamp={false}
        />
      )}
    </div>
  );
}
