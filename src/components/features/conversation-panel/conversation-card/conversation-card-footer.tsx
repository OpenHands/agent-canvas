import { useTranslation } from "react-i18next";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { RepositorySelection } from "#/api/open-hands.types";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { isExecutionPaused } from "#/utils/status";
import { getAcpProviderDisplayName } from "#/constants/acp-providers";
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
  llmModel?: string | null;
  showLlmModel?: boolean;
  /**
   * High-level kind of the conversation's agent. The ACP-agent chip is
   * only rendered when this is ``"acp"``. The OpenHands rendering path
   * is intentionally untouched — for OpenHands conversations the chip is
   * suppressed regardless of any ``acpServer`` value (defensive against
   * stray wire tags on non-ACP conversations).
   */
  agentKind?: "openhands" | "acp" | null;
  /**
   * Registry key of the ACP CLI server (``"claude-code"`` / ``"codex"`` /
   * ``"gemini-cli"`` / unknown / null). Resolved to a human display name
   * via {@link getAcpProviderDisplayName}; unknown / null falls back to
   * a generic "ACP" label so a Custom-command preset still produces a
   * useful chip. Always shown for ACP conversations — this is identity
   * info, not gated by the ``showLlmModel`` preference (which is about
   * LLM model strings, an orthogonal concern).
   */
  acpServer?: string | null;
}

export function ConversationCardFooter({
  selectedRepository,
  lastUpdatedAt,
  createdAt,
  executionStatus,
  workspaceWorkingDir,
  showRepositoryMetadata = true,
  showTimestamp = true,
  llmModel,
  showLlmModel = false,
  agentKind = null,
  acpServer = null,
}: ConversationCardFooterProps) {
  const { t } = useTranslation("openhands");

  const isPaused = isExecutionPaused(executionStatus);

  const acpDisplayName =
    agentKind === "acp"
      ? (getAcpProviderDisplayName(acpServer) ??
        t(I18nKey.CONVERSATION$ACP_AGENT_GENERIC))
      : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 mt-0.5 w-full min-w-0",
        isPaused && "opacity-60",
      )}
    >
      {acpDisplayName ? (
        <div className="pl-[18px]">
          <span
            data-testid="conversation-card-acp-badge"
            className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[var(--oh-surface-raised)] text-[var(--oh-muted)] text-xs font-medium max-w-full truncate"
            title={acpDisplayName}
          >
            {acpDisplayName}
          </span>
        </div>
      ) : null}
      {showLlmModel && llmModel ? (
        <span
          className="min-w-0 max-w-full truncate pl-[18px] text-xs text-[var(--oh-muted)]"
          title={llmModel}
        >
          {llmModel}
        </span>
      ) : null}
      <div
        className={cn(
          // Align repo/workspace row with the title (status dot + gap).
          "flex flex-row items-center gap-2 w-full min-w-0",
          showRepositoryMetadata && "pl-[18px]",
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
            <p className="text-xs text-[var(--oh-muted)] text-right">
              <time>
                {`${formatTimeDelta(lastUpdatedAt ?? createdAt)} ${t(I18nKey.CONVERSATION$AGO)}`}
              </time>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
