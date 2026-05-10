import React from "react";
import { Tooltip } from "@heroui/react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { RepositorySelection } from "#/api/open-hands.types";
import { cn } from "#/utils/utils";
import { ConversationStatusDot } from "../home/recent-conversations/conversation-status-dot";
import { ConversationCardFooter } from "./conversation-card/conversation-card-footer";

interface CompactConversationRowProps {
  conversationId: string;
  title: string;
  selectedRepository: RepositorySelection | null;
  executionStatus?: ExecutionStatus | null;
  lastUpdatedAt: string;
  createdAt?: string;
  workspaceWorkingDir?: string | null;
  isActive?: boolean;
  onClose?: () => void;
}

/**
 * Minimal one-row presentation of a conversation used by the collapsed
 * sidebar. The row itself is just the agent status dot; hovering it shows a
 * floating preview with the conversation's title, repo and timestamp.
 */
export function CompactConversationRow({
  conversationId,
  title,
  selectedRepository,
  executionStatus,
  lastUpdatedAt,
  createdAt,
  workspaceWorkingDir,
  isActive = false,
  onClose,
}: CompactConversationRowProps) {
  const disableAnimation = import.meta.env.MODE === "test";

  const preview = (
    <div className="w-[260px] p-3">
      <div className="flex items-center gap-2 mb-1">
        <ConversationStatusDot
          executionStatus={executionStatus}
          showTooltip={false}
        />
        <span className="text-sm font-medium text-white truncate" title={title}>
          {title || "(untitled)"}
        </span>
      </div>
      <ConversationCardFooter
        selectedRepository={selectedRepository}
        lastUpdatedAt={lastUpdatedAt}
        createdAt={createdAt}
        executionStatus={executionStatus}
        workspaceWorkingDir={workspaceWorkingDir}
      />
    </div>
  );

  return (
    <Tooltip
      content={preview}
      placement="right"
      closeDelay={100}
      className="bg-[#1f2228] text-white border border-[#2a2f38] shadow-xl p-0"
      disableAnimation={disableAnimation}
    >
      <NavigationLink
        to={`/conversations/${conversationId}`}
        onClick={onClose}
        data-testid="compact-conversation-row"
        data-conversation-id={conversationId}
        aria-label={title || conversationId}
        className={({ isActive: navActive }) =>
          cn(
            "flex items-center justify-center w-10 h-9 mx-auto rounded-md",
            "transition-colors cursor-pointer",
            navActive || isActive ? "bg-[#1f1f1f99]" : "hover:bg-[#1f1f1f99]",
          )
        }
      >
        <ConversationStatusDot
          executionStatus={executionStatus}
          showTooltip={false}
        />
      </NavigationLink>
    </Tooltip>
  );
}
