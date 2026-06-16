import { useTranslation } from "react-i18next";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { RepositorySelection } from "#/api/open-hands.types";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { isExecutionPaused } from "#/utils/status";
import {
  getAcpProviderDisplayName,
  labelForAcpModel,
  resolveAcpProviderIcon,
  formatNativeModelString,
} from "#/constants/acp-providers";
import {
  AgentBrandIcon,
  type AgentBrandIconKind,
} from "#/components/shared/agent-brand-icon";
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
   * Whether to render the agent/model chip. Wired to the conversation
   * panel's "LLM model" toggle (off by default); gates the chip uniformly
   * for both ACP and OpenHands cards.
   */
  showAgentChip?: boolean;
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
  showAgentChip = false,
  agentKind = null,
  acpServer = null,
}: ConversationCardFooterProps) {
  const { t } = useTranslation("openhands");

  const isPaused = isExecutionPaused(executionStatus);

  // Single inline chip per conversation: [brand mark] {model text}. Gated by
  // the conversation panel's "LLM model" toggle (off by default) and applied
  // uniformly to both kinds — OpenHands shows the logo + ``agent.llm.model``;
  // ACP shows the provider brand mark + model resolved through PR 730's
  // adapter chain, falling back to the provider display name when no model is
  // available so the chip never collapses to icon-only.
  let chip: {
    kind: AgentBrandIconKind;
    text: string;
    tooltip: string;
  } | null = null;
  if (showAgentChip) {
    if (agentKind === "acp") {
      const providerName =
        getAcpProviderDisplayName(acpServer) ??
        t(I18nKey.CONVERSATION$ACP_AGENT_GENERIC);
      // Prefer the provider's picker label (e.g. "Claude Opus 4.7") over the
      // raw ``acp_model`` ID; falls back to the raw ID for custom overrides
      // and to the provider name when there's no model at all.
      const modelLabel = labelForAcpModel(acpServer, llmModel);
      const text = modelLabel ?? providerName;
      chip = {
        kind: resolveAcpProviderIcon(acpServer),
        text,
        tooltip: modelLabel ? `${providerName} · ${modelLabel}` : providerName,
      };
    } else if (llmModel) {
      const formattedModel = formatNativeModelString(llmModel);
      chip = {
        kind: "openhands",
        text: formattedModel ?? llmModel,
        tooltip: llmModel,
      };
    }
  }

  // Match title text start: 18px status column + gap-2 (8px).
  const metadataIndentClass =
    executionStatus !== undefined ? "pl-[26px]" : undefined;

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 mt-0.5 w-full min-w-0",
        isPaused && "opacity-60",
      )}
    >
      {chip ? (
        <div className={metadataIndentClass}>
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
          "flex flex-row items-center gap-2 w-full min-w-0",
          showRepositoryMetadata && metadataIndentClass,
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
