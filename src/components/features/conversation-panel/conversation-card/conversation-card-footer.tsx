import { useTranslation } from "react-i18next";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { RepositorySelection } from "#/api/open-hands.types";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { isExecutionPaused } from "#/utils/status";
import { ConversationRepoLink } from "./conversation-repo-link";
import { NoRepository } from "./no-repository";

interface ConversationCardFooterProps {
  selectedRepository: RepositorySelection | null;
  lastUpdatedAt: string;
  createdAt?: string;
  executionStatus?: ExecutionStatus | null;
  workspaceWorkingDir?: string | null;
  showRepositoryMetadata?: boolean;
  showTimestamp?: boolean;
}

export function ConversationCardFooter({
  selectedRepository,
  lastUpdatedAt,
  createdAt,
  executionStatus,
  workspaceWorkingDir,
  showRepositoryMetadata = true,
  showTimestamp = true,
}: ConversationCardFooterProps) {
  const { t } = useTranslation("openhands");

  const isPaused = isExecutionPaused(executionStatus);

  return (
    <div
      className={cn(
        // Left padding aligns the repo/workspace icon with the title text in
        // the header (status dot 10px + gap-2 8px = 18px).
        "flex flex-row items-center gap-2 mt-0.5 w-full min-w-0",
        showRepositoryMetadata && "pl-[18px]",
        isPaused && "opacity-60",
      )}
    >
      {showRepositoryMetadata &&
        (selectedRepository?.selected_repository ? (
          <ConversationRepoLink selectedRepository={selectedRepository} />
        ) : (
          <NoRepository workspaceWorkingDir={workspaceWorkingDir} />
        ))}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {showTimestamp && (createdAt ?? lastUpdatedAt) && (
          <p className="text-xs text-[#A3A3A3] text-right">
            <time>
              {`${formatTimeDelta(lastUpdatedAt ?? createdAt)} ${t(I18nKey.CONVERSATION$AGO)}`}
            </time>
          </p>
        )}
      </div>
    </div>
  );
}
