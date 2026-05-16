import React from "react";
import { cn } from "#/utils/utils";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { isExecutionActive, isExecutionPaused } from "#/utils/status";
import { ConversationCardContextMenu } from "./conversation-card-context-menu";
import { EllipsisButton } from "../ellipsis-button";

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
    <div className="group">
      <EllipsisButton
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenuToggle(!contextMenuOpen);
        }}
        className={cn(isPaused && "opacity-60")}
      />
      <div
        className={cn(
          "relative opacity-0 invisible group-hover:opacity-100 group-hover:visible",
          contextMenuOpen && "visible z-[200] opacity-100",
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
