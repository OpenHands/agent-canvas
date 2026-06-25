import React from "react";
import { createPortal } from "react-dom";
import { Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTracking } from "#/hooks/use-tracking";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { transformVSCodeUrl } from "#/utils/vscode-url-helper";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import {
  SandboxStatus,
  type AppConversation,
} from "#/api/conversation-service/agent-server-conversation-service.types";
import { RepositorySelection } from "#/api/open-hands.types";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { ConversationCardHeader } from "./conversation-card-header";
import { ConversationCardActions } from "./conversation-card-actions";
import { ConversationCardFooter } from "./conversation-card-footer";
import { ConversationStatusBadges } from "./conversation-status-badges";
import { ConversationSourceBadges } from "./conversation-source-badges";
import { ConductorRowContextMenu } from "./conductor-row-context-menu";
import { ConversationDiffStatChip } from "./conversation-diff-stat-chip";
import { VerificationVerdictBadge } from "./verification-verdict-badge";
import type { ConversationStatusBucketId } from "../conversation-panel-list-helpers";
import { useDownloadConversation } from "#/hooks/use-download-conversation";
import { useConversationDiffStat } from "#/hooks/query/use-conversation-diff-stat";
import { useConversationCheckResult } from "#/hooks/query/use-conversation-check-result";

const RIGHT_CLICK_MENU_WIDTH = 240;
const RIGHT_CLICK_MENU_HEIGHT = 300;

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
  sandboxStatus?: SandboxStatus | null;
  conversationId?: string;
  conversationUrl?: string | null;
  sessionApiKey?: string | null;
  contextMenuOpen?: boolean;
  onContextMenuToggle?: (isOpen: boolean) => void;
  isActive?: boolean;
  workspaceWorkingDir?: string | null;
  showRepositoryMetadata?: boolean;
  llmModel?: string | null;
  showLlmProfiles?: boolean;
  agentKind?: "openhands" | "acp" | null;
  acpServer?: string | null;
  /** Whether this conversation was launched by Hermes (drives the source chip). */
  isHermes?: boolean;
  /**
   * Display label for the conversation's project (registry name, or the raw
   * slug when not in the local registry). Null when the conversation has no
   * project tag. Drives the project chip.
   */
  projectLabel?: string | null;
  /** Owner label for another user's session (navigability half of mine/all). */
  ownerLabel?: string | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
  /** Whether the user muted this conversation's attention signals. */
  isMuted?: boolean;
  onToggleMute?: () => void;
  /** When true and pinned, keep the pin icon visible without hovering. */
  alwaysShowPinIcon?: boolean;
  /** Server-stamped tags; source/linear/requester render as provenance badges. */
  tags?: AppConversation["tags"];
  isUnread?: boolean;
  onToggleUnread?: () => void;
  isArchived?: boolean;
  onToggleArchive?: () => void;
  statusOverride?: ConversationStatusBucketId | null;
  onSetStatus?: (bucket: ConversationStatusBucketId) => void;
  onClearStatus?: () => void;
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
  conversationUrl,
  sessionApiKey,
  executionStatus,
  sandboxStatus,
  contextMenuOpen = false,
  onContextMenuToggle,
  isActive = false,
  workspaceWorkingDir,
  showRepositoryMetadata = true,
  llmModel = null,
  showLlmProfiles = false,
  agentKind = null,
  acpServer = null,
  isHermes = false,
  projectLabel = null,
  ownerLabel = null,
  isPinned = false,
  onTogglePin,
  isMuted = false,
  onToggleMute,
  alwaysShowPinIcon = false,
  tags = null,
  isUnread = false,
  onToggleUnread,
  isArchived = false,
  onToggleArchive,
  statusOverride = null,
  onSetStatus,
  onClearStatus,
}: ConversationCardProps) {
  const { t } = useTranslation("openhands");
  const { trackDownloadVsCodeButtonClicked } = useTracking();
  const [titleMode, setTitleMode] = React.useState<"view" | "edit">("view");
  const [rightClickPos, setRightClickPos] = React.useState<{
    top: number;
    left: number;
  } | null>(null);
  const { mutateAsync: downloadConversation } = useDownloadConversation();

  const diffStat = useConversationDiffStat({
    conversationId,
    selectedRepository: selectedRepository?.selected_repository,
    workingDir: workspaceWorkingDir,
    sandboxStatus,
  });
  const checkResult = useConversationCheckResult({
    conversationId,
    conversationUrl,
    sessionApiKey,
    executionStatus,
    sandboxStatus,
  });

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
    trackDownloadVsCodeButtonClicked();

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

  const handleTogglePin = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onTogglePin?.();
  };

  // The Conductor right-click menu is only meaningful when the row exposes the
  // conductor actions (status/archive/unread come from the panel together).
  const hasConductorMenu = !!(onSetStatus || onToggleArchive || onToggleUnread);

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hasConductorMenu) return;
    event.preventDefault();
    event.stopPropagation();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    setRightClickPos({
      top: Math.min(event.clientY, Math.max(8, vh - RIGHT_CLICK_MENU_HEIGHT)),
      left: Math.min(event.clientX, Math.max(8, vw - RIGHT_CLICK_MENU_WIDTH)),
    });
  };

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const renderPinButton = () => (
    <button
      type="button"
      data-testid={
        conversationId
          ? `conversation-pin-toggle-${conversationId}`
          : "conversation-pin-toggle"
      }
      aria-pressed={isPinned}
      aria-label={
        isPinned
          ? t(I18nKey.CONVERSATION_PANEL$UNPIN_CONVERSATION)
          : t(I18nKey.CONVERSATION_PANEL$PIN_CONVERSATION)
      }
      onClick={handleTogglePin}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1",
        "text-[var(--oh-muted)] hover:bg-white/10 hover:text-foreground",
      )}
    >
      <Pin
        className={cn("h-3.5 w-3.5", isPinned && "fill-current")}
        aria-hidden
      />
    </button>
  );

  const hasContextMenu = !!(onDelete || onChangeTitle || showOptions);
  const hasHoverActions = hasContextMenu || !!onTogglePin;
  const showPersistentPinIcon = alwaysShowPinIcon && isPinned && !!onTogglePin;
  const shouldRenderFooter =
    showRepositoryMetadata ||
    (showLlmProfiles && (agentKind === "acp" || !!llmModel));

  return (
    <div
      data-testid="conversation-card"
      data-context-menu-open={contextMenuOpen.toString()}
      data-active={isActive ? "true" : "false"}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      className={cn(
        "group relative h-auto w-full cursor-pointer rounded-md py-1 pl-2 pr-1 transition-colors",
        !contextMenuOpen && "hover:bg-[var(--oh-surface)]",
        (isActive || contextMenuOpen) && "bg-[var(--oh-surface)]",
      )}
    >
      <div className="flex items-center w-full min-w-0">
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
          {isUnread ? (
            <span
              data-testid="conversation-unread-dot"
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--oh-status-warning)]"
            />
          ) : null}
          <ConversationCardHeader
            title={title}
            titleMode={titleMode}
            onTitleSave={onTitleSave}
            executionStatus={executionStatus}
            sandboxStatus={sandboxStatus}
          />
          <VerificationVerdictBadge status={checkResult.data?.status ?? null} />
          {sandboxStatus === "ERROR" && <ConversationStatusBadges />}
        </div>

        <div
          className={cn(
            "relative ml-auto pl-2 flex items-center justify-end shrink-0",
            // The hover action overlay (pin + ellipsis) is absolutely
            // positioned, so reserve its width so the flex-1 title truncates
            // instead of colliding with the buttons. Pinned cards keep the pin
            // visible at rest, so reserve the width always for those.
            showPersistentPinIcon
              ? "min-w-[3.75rem]"
              : hasHoverActions &&
                  "group-hover:min-w-[3.75rem] group-focus-within:min-w-[3.75rem]",
            contextMenuOpen && "min-w-[3.75rem]",
          )}
        >
          {!showPersistentPinIcon &&
            (diffStat || createdAt || lastUpdatedAt) && (
              <div
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap transition-opacity -translate-x-1.5",
                  hasHoverActions &&
                    "group-hover:opacity-0 group-focus-within:opacity-0",
                  contextMenuOpen && "opacity-0",
                )}
              >
                {diffStat ? <ConversationDiffStatChip stat={diffStat} /> : null}
                {(createdAt ?? lastUpdatedAt) ? (
                  <p className="text-right text-xs text-[var(--oh-muted)]">
                    <time>{formatTimeDelta(lastUpdatedAt ?? createdAt)}</time>
                  </p>
                ) : null}
              </div>
            )}

          {hasHoverActions ? (
            <div
              className={cn(
                "absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5 transition-opacity",
                showPersistentPinIcon
                  ? "pointer-events-auto visible opacity-100"
                  : cn(
                      "pointer-events-none opacity-0 invisible",
                      "group-hover:pointer-events-auto group-hover:opacity-100 group-hover:visible",
                      "group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-focus-within:visible",
                    ),
                contextMenuOpen && "pointer-events-auto visible opacity-100",
              )}
            >
              {onTogglePin ? renderPinButton() : null}
              {showPersistentPinIcon &&
              (createdAt ?? lastUpdatedAt) &&
              hasContextMenu ? (
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      !contextMenuOpen &&
                        "invisible pointer-events-none group-hover:visible group-hover:pointer-events-auto group-focus-within:visible group-focus-within:pointer-events-auto",
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
                  <p
                    className={cn(
                      "pointer-events-none absolute inset-0 flex items-center justify-end",
                      "text-xs text-[var(--oh-muted)] whitespace-nowrap -translate-x-1.5",
                      "group-hover:hidden group-focus-within:hidden",
                      contextMenuOpen && "hidden",
                    )}
                  >
                    <time>{formatTimeDelta(lastUpdatedAt ?? createdAt)}</time>
                  </p>
                </div>
              ) : null}
              {!showPersistentPinIcon && hasContextMenu ? (
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
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <ConversationSourceBadges tags={tags} className="mt-1 pl-[26px]" />

      {shouldRenderFooter && (
        <ConversationCardFooter
          selectedRepository={selectedRepository}
          lastUpdatedAt={lastUpdatedAt}
          createdAt={createdAt}
          executionStatus={executionStatus}
          workspaceWorkingDir={workspaceWorkingDir}
          showRepositoryMetadata={showRepositoryMetadata}
          showTimestamp={false}
          llmModel={llmModel}
          showAgentChip={showLlmProfiles}
          agentKind={agentKind}
          acpServer={acpServer}
          isHermes={isHermes}
          projectLabel={projectLabel}
          ownerLabel={ownerLabel}
          isMuted={isMuted}
        />
      )}

      {rightClickPos && portalTarget
        ? createPortal(
            <ConductorRowContextMenu
              style={{
                position: "fixed",
                top: rightClickPos.top,
                left: rightClickPos.left,
                zIndex: 100_000,
              }}
              onClose={() => setRightClickPos(null)}
              isUnread={isUnread}
              onToggleUnread={() => onToggleUnread?.()}
              isPinned={isPinned}
              onTogglePin={() => onTogglePin?.()}
              isMuted={isMuted}
              onToggleMute={() => onToggleMute?.()}
              statusOverride={statusOverride}
              onSetStatus={(bucket) => onSetStatus?.(bucket)}
              onClearStatus={() => onClearStatus?.()}
              onRename={() => setTitleMode("edit")}
              isArchived={isArchived}
              onToggleArchive={() => onToggleArchive?.()}
              onDelete={() => onDelete?.()}
            />,
            portalTarget,
          )
        : null}
    </div>
  );
}
