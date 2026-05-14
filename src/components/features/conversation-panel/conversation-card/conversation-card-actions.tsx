import React from "react";
import { cn } from "#/utils/utils";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { isExecutionActive, isExecutionPaused } from "#/utils/status";
import { ConversationCardContextMenu } from "./conversation-card-context-menu";
import EllipsisIcon from "#/icons/ellipsis.svg?react";

interface ConversationCardActionsProps {
  contextMenuOpen: boolean;
  onContextMenuToggle: (isOpen: boolean) => void;
  onDelete?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onStop?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onEdit?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDownloadViaVSCode?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDownloadConversation?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  executionStatus?: ExecutionStatus | null;
  conversationId?: string;
  showOptions?: boolean;
}

export function ConversationCardActions({
  contextMenuOpen,
  onContextMenuToggle,
  onDelete,
  onStop,
  onEdit,
  onDownloadViaVSCode,
  onDownloadConversation,
  executionStatus,
  conversationId,
  showOptions,
}: ConversationCardActionsProps) {
  const isPaused = isExecutionPaused(executionStatus);
  const isActive = isExecutionActive(executionStatus);

  return (
    <div className="relative">
      <button
        data-testid="ellipsis-button"
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenuToggle(!contextMenuOpen);
        }}
        className={cn(
          "cursor-pointer w-6 h-6 flex flex-row items-center justify-center translate-x-2.5",
          isPaused && "opacity-60",
        )}
      >
        <EllipsisIcon />
      </button>
      <div
        className={cn(
          "relative",
          contextMenuOpen
            ? "opacity-100 visible z-[60]"
            : "opacity-0 invisible pointer-events-none",
        )}
      >
        <ConversationCardContextMenu
          onClose={() => onContextMenuToggle(false)}
          onDelete={onDelete}
          onStop={isActive ? onStop : undefined}
          onEdit={onEdit}
          onDownloadViaVSCode={
            conversationId && showOptions ? onDownloadViaVSCode : undefined
          }
          onDownloadConversation={
            conversationId ? onDownloadConversation : undefined
          }
          position="bottom"
        />
      </div>
    </div>
  );
}
