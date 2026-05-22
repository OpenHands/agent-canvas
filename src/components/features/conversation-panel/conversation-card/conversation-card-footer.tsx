import { useTranslation } from "react-i18next";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { RepositorySelection } from "#/api/open-hands.types";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { isExecutionPaused } from "#/utils/status";
import {
  getAcpProviderDisplayName,
  resolveAcpProviderIcon,
  type ACPProviderIcon,
} from "#/constants/acp-providers";
import { AgentBrandIcon } from "#/components/shared/agent-brand-icon";
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
  /**
   * High-level kind of the conversation's agent. Drives the chip's icon:
   * the OpenHands logo for native conversations and the resolved ACP brand
   * mark for ACP conversations. Defensive against stray ``acpServer``
   * values reaching an OpenHands card.
   */
  agentKind?: "openhands" | "acp" | null;
  /**
   * Registry key of the ACP CLI server (``"claude-code"`` / ``"codex"`` /
   * ``"gemini-cli"`` / unknown / null). Resolved to a human display name
   * via {@link getAcpProviderDisplayName}; unknown / null falls back to
   * a generic "ACP" label so a Custom-command preset still produces a
   * useful chip.
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
  agentKind = null,
  acpServer = null,
}: ConversationCardFooterProps) {
  const { t } = useTranslation("openhands");

  const isPaused = isExecutionPaused(executionStatus);

  // Single inline chip per conversation: [brand mark] {model text}. Always
  // shown when there's something meaningful to render — OpenHands shows the
  // logo + ``agent.llm.model``; ACP shows the provider brand mark + model
  // resolved through PR 730's adapter chain, falling back to the provider
  // display name when no model is available so the chip never collapses to
  // icon-only.
  let chip: { kind: ACPProviderIcon; text: string; tooltip: string } | null =
    null;
  if (agentKind === "acp") {
    const providerName =
      getAcpProviderDisplayName(acpServer) ??
      t(I18nKey.CONVERSATION$ACP_AGENT_GENERIC);
    const text = llmModel ?? providerName;
    chip = {
      kind: resolveAcpProviderIcon(acpServer),
      text,
      tooltip: llmModel ? `${providerName} · ${llmModel}` : providerName,
    };
  } else if (llmModel) {
    chip = { kind: "openhands", text: llmModel, tooltip: llmModel };
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 mt-0.5 w-full min-w-0",
        isPaused && "opacity-60",
      )}
    >
      {chip ? (
        <div className="pl-[18px]">
          <span
            data-testid="conversation-card-agent-chip"
            className="inline-flex items-center gap-1 text-xs text-[var(--oh-muted)] max-w-full min-w-0"
            title={chip.tooltip}
          >
            <AgentBrandIcon kind={chip.kind} />
            <span className="truncate">{chip.text}</span>
          </span>
        </div>
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
