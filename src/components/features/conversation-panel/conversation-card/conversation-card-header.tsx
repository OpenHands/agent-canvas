import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { ConversationCardTitle } from "./conversation-card-title";
import { ConversationStatusDot } from "../conversation-status-dot";

interface ConversationCardHeaderProps {
  title: string;
  titleMode: "view" | "edit";
  onTitleSave: (title: string) => void;
  executionStatus?: ExecutionStatus | null;
}

export function ConversationCardHeader({
  title,
  titleMode,
  onTitleSave,
  executionStatus,
}: ConversationCardHeaderProps) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
      {executionStatus !== undefined && (
        <div className="flex items-center">
          <ConversationStatusDot executionStatus={executionStatus} />
        </div>
      )}
      <ConversationCardTitle
        title={title}
        titleMode={titleMode}
        onSave={onTitleSave}
        isConversationArchived={false}
      />
    </div>
  );
}
