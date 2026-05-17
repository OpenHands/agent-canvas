import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ConversationCardTitle } from "./conversation-card-title";
import { ConversationStatusDot } from "../conversation-status-dot";

interface ConversationCardHeaderProps {
  title: string;
  titleMode: "view" | "edit";
  onTitleSave: (title: string) => void;
  executionStatus?: ExecutionStatus | null;
  sandboxStatus?: SandboxStatus | null;
}

export function ConversationCardHeader({
  title,
  titleMode,
  onTitleSave,
  executionStatus,
  sandboxStatus,
}: ConversationCardHeaderProps) {
  const isArchived = sandboxStatus === "MISSING" || sandboxStatus === "ERROR";
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
      {executionStatus !== undefined && (
        <div className="flex items-center">
          <ConversationStatusDot
            executionStatus={executionStatus}
            sandboxStatus={sandboxStatus}
          />
        </div>
      )}
      <ConversationCardTitle
        title={title}
        titleMode={titleMode}
        onSave={onTitleSave}
        isConversationArchived={isArchived}
      />
    </div>
  );
}
