import React from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { Cpu, Wrench } from "lucide-react";
import { AgentStatus } from "#/components/features/controls/agent-status";
import { Tools } from "../../controls/tools";
import { ChangeAgentButton } from "../change-agent-button";
import { ChatInputModel } from "./chat-input-model";
import { ChatAddFileButton } from "../chat-add-file-button";
import { ChatSendButton } from "../chat-send-button";
import { NavigationLink } from "#/components/shared/navigation-link";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import CarretRightFillIcon from "#/icons/carret-right-fill.svg?react";
import LessonPlanIcon from "#/icons/lesson-plan.svg?react";
import ThreeDotsVerticalIcon from "#/icons/three-dots-vertical.svg?react";
import { CodePillIcon } from "#/icons/code-pill";
import { useUnifiedPauseConversation } from "#/hooks/mutation/use-unified-stop-conversation";
import { useConversationId } from "#/hooks/use-conversation-id";
import { usePauseConversation } from "#/hooks/mutation/use-pause-conversation";
import { useResumeConversation } from "#/hooks/mutation/use-resume-conversation";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useConversationNameContextMenu } from "#/hooks/use-conversation-name-context-menu";
import { useConversationStore } from "#/stores/conversation-store";
import { useAgentState } from "#/hooks/use-agent-state";
import { AgentState } from "#/types/agent-state";
import { useUnifiedWebSocketStatus } from "#/hooks/use-unified-websocket-status";
import { useHandlePlanClick } from "#/hooks/use-handle-plan-click";
import { I18nKey } from "#/i18n/declaration";
import { SystemMessageModal } from "../../conversation-panel/system-message-modal";
import { SkillsModal } from "../../conversation-panel/skills-modal";
import { HooksModal } from "../../conversation-panel/hooks-modal";
import { ToolsContextMenu } from "../../controls/tools-context-menu";
import { ToolsContextMenuIconText } from "../../controls/tools-context-menu-icon-text";
import { ContextMenuListItem } from "../../context-menu/context-menu-list-item";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { cn } from "#/utils/utils";
import { CONTEXT_MENU_ICON_TEXT_CLASSNAME } from "#/utils/constants";

interface ChatInputActionsProps {
  disabled: boolean;
  canSubmit?: boolean;
  onAddFileClick?: () => void;
  showButton?: boolean;
  buttonClassName?: string;
  handleSubmit?: () => void;
}

export function ChatInputActions({
  disabled,
  canSubmit = true,
  onAddFileClick = () => {},
  showButton = true,
  buttonClassName = "",
  handleSubmit = () => {},
}: ChatInputActionsProps) {
  const { t } = useTranslation("openhands");
  const unifiedPauseMutation = useUnifiedPauseConversation();
  const pauseConversationMutation = usePauseConversation();
  const resumeConversationMutation = useResumeConversation();
  const { conversationId } = useConversationId();
  const { data: conversation } = useActiveConversation();
  const isCloud = useActiveBackend().backend.kind === "cloud";
  const webSocketStatus = useUnifiedWebSocketStatus();
  const { curAgentState } = useAgentState();
  const { conversationMode, setConversationMode } = useConversationStore();
  const { handlePlanClick, isCreatingConversation } = useHandlePlanClick();

  const actionsRowRef = React.useRef<HTMLDivElement>(null);
  const rightSectionRef = React.useRef<HTMLDivElement>(null);
  const addFileRef = React.useRef<HTMLDivElement>(null);
  const toolsRef = React.useRef<HTMLDivElement>(null);
  const codeRef = React.useRef<HTMLDivElement>(null);
  const modelRef = React.useRef<HTMLDivElement>(null);
  const overflowTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [actionsRowWidth, setActionsRowWidth] = React.useState<number>(
    Number.POSITIVE_INFINITY,
  );
  const [rightSectionWidth, setRightSectionWidth] = React.useState(0);
  const [addFileWidth, setAddFileWidth] = React.useState(32);
  const [toolsWidth, setToolsWidth] = React.useState(100);
  const [codeWidth, setCodeWidth] = React.useState(96);
  const [modelWidth, setModelWidth] = React.useState(120);
  const [isOverflowOpen, setIsOverflowOpen] = React.useState(false);
  const [activeSubmenu, setActiveSubmenu] = React.useState<
    "tools" | "agent" | "model" | null
  >(null);
  const [overflowPortalStyle, setOverflowPortalStyle] =
    React.useState<React.CSSProperties>();

  const {
    handleShowAgentTools,
    handleShowSkills,
    handleShowHooks,
    systemModalVisible,
    setSystemModalVisible,
    skillsModalVisible,
    setSkillsModalVisible,
    hooksModalVisible,
    setHooksModalVisible,
    systemMessage,
    shouldShowAgentTools,
    shouldShowHooks,
  } = useConversationNameContextMenu({
    conversationId,
    executionStatus: conversation?.execution_status,
    showOptions: true,
    onContextMenuToggle: setIsOverflowOpen,
  });

  React.useEffect(() => {
    const rowEl = actionsRowRef.current;
    const rightEl = rightSectionRef.current;
    const addEl = addFileRef.current;
    const toolsEl = toolsRef.current;
    const codeEl = codeRef.current;
    const modelEl = modelRef.current;

    if (
      !rowEl ||
      !rightEl ||
      !addEl ||
      !toolsEl ||
      !modelEl ||
      (isCloud && !codeEl) ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const syncWidths = () => {
      const nextRowWidth = rowEl.getBoundingClientRect().width;
      const nextRightWidth = rightEl.getBoundingClientRect().width;
      const nextAddWidth = addEl.getBoundingClientRect().width;
      const nextToolsWidth = toolsEl.getBoundingClientRect().width;
      const nextModelWidth = modelEl.getBoundingClientRect().width;

      if (nextRowWidth > 0) setActionsRowWidth(nextRowWidth);
      if (nextRightWidth > 0) setRightSectionWidth(nextRightWidth);
      if (nextAddWidth > 0) setAddFileWidth(nextAddWidth);
      if (nextToolsWidth > 0) setToolsWidth(nextToolsWidth);
      if (nextModelWidth > 0) setModelWidth(nextModelWidth);

      if (codeEl) {
        const nextCodeWidth = codeEl.getBoundingClientRect().width;
        if (nextCodeWidth > 0) setCodeWidth(nextCodeWidth);
      }
    };

    const observer = new ResizeObserver(() => {
      syncWidths();
    });

    observer.observe(rowEl);
    observer.observe(rightEl);
    observer.observe(addEl);
    observer.observe(toolsEl);
    observer.observe(modelEl);
    if (codeEl) {
      observer.observe(codeEl);
    }

    syncWidths();

    return () => observer.disconnect();
  }, [isCloud]);

  const handlePauseAgent = () => {
    // Pause the conversation (agent execution)
    pauseConversationMutation.mutate({ conversationId });
  };

  const handleResumeAgentClick = () => {
    // Resume the conversation (agent execution)
    resumeConversationMutation.mutate({ conversationId });
  };

  const isPausing =
    unifiedPauseMutation.isPending || pauseConversationMutation.isPending;

  const OVERFLOW_BUTTON_WIDTH = 28;
  const INLINE_GAP = 12;
  const ROOT_GAP = 8;

  const fitOptionalItems = React.useCallback(
    (availableWidth: number) => {
      let remaining = availableWidth;
      const next = {
        showToolsInline: false,
        showCodeInline: false,
        showModelInline: false,
      };

      if (remaining >= toolsWidth) {
        next.showToolsInline = true;
        remaining -= toolsWidth + INLINE_GAP;
      }

      if (isCloud && remaining >= codeWidth) {
        next.showCodeInline = true;
        remaining -= codeWidth + INLINE_GAP;
      }

      if (remaining >= modelWidth) {
        next.showModelInline = true;
      }

      return next;
    },
    [toolsWidth, isCloud, codeWidth, modelWidth],
  );

  const leftBaseWidth =
    actionsRowWidth - rightSectionWidth - ROOT_GAP - addFileWidth - INLINE_GAP;

  const fitWithoutOverflow = fitOptionalItems(leftBaseWidth);
  const allOptionalFit =
    fitWithoutOverflow.showToolsInline &&
    (!isCloud || fitWithoutOverflow.showCodeInline) &&
    fitWithoutOverflow.showModelInline;

  const fitWithOverflow = allOptionalFit
    ? fitWithoutOverflow
    : fitOptionalItems(leftBaseWidth - OVERFLOW_BUTTON_WIDTH - INLINE_GAP);

  const showToolsInline = fitWithOverflow.showToolsInline;
  const showCodeInline = !isCloud ? false : fitWithOverflow.showCodeInline;
  const showModelInline = fitWithOverflow.showModelInline;
  const showAddFileInline = true;
  const showAgentStatusInline = actionsRowWidth >= 360;

  const hasOverflowItems =
    !showAddFileInline ||
    !showToolsInline ||
    (isCloud && !showCodeInline) ||
    !showModelInline;

  React.useEffect(() => {
    if (!hasOverflowItems) {
      setIsOverflowOpen(false);
      setActiveSubmenu(null);
    }
  }, [hasOverflowItems]);

  const overflowMenuRef = useClickOutsideElement<HTMLUListElement>(() => {
    setIsOverflowOpen(false);
    setActiveSubmenu(null);
  });

  const isAgentSwitcherDisabled =
    curAgentState === AgentState.RUNNING ||
    isCreatingConversation ||
    webSocketStatus !== "OPEN";

  const closeOverflowMenus = () => {
    setActiveSubmenu(null);
    setIsOverflowOpen(false);
  };

  const contextMenuListItemClassName = cn(
    "cursor-pointer p-0 h-auto hover:bg-transparent",
    CONTEXT_MENU_ICON_TEXT_CLASSNAME,
  );

  React.useLayoutEffect(() => {
    if (!isOverflowOpen || !overflowTriggerRef.current) {
      return;
    }

    const trigger = overflowTriggerRef.current;

    const updatePosition = () => {
      const rect = trigger.getBoundingClientRect();
      const GAP = 8;
      setOverflowPortalStyle({
        position: "fixed",
        top: rect.top - GAP,
        left: rect.left,
        transform: "translateY(-100%)",
        zIndex: 9999,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOverflowOpen]);

  const overflowMenu = (
    <ContextMenu
      ref={overflowMenuRef}
      testId="chat-input-overflow-menu"
      position="top"
      alignment="left"
      className="!static !top-auto !bottom-auto !left-auto !right-auto !mt-0 overflow-visible min-w-[200px]"
    >
      {!showToolsInline && (
        <div className="relative group/overflow-tools">
          <ContextMenuListItem
            testId="overflow-tools-button"
            onClick={() =>
              setActiveSubmenu((current) =>
                current === "tools" ? null : "tools",
              )
            }
            className={contextMenuListItemClassName}
          >
            <ToolsContextMenuIconText
              icon={<Wrench width={16} height={16} strokeWidth={2} />}
              text={t(I18nKey.MICROAGENTS_MODAL$TOOLS)}
              rightIcon={<CarretRightFillIcon width={10} height={10} />}
              className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
            />
          </ContextMenuListItem>
          <div
            className={cn(
              "absolute left-full top-[-6px] z-60 opacity-0 invisible pointer-events-none transition-all duration-200 ml-[1px]",
              "group-hover/overflow-tools:opacity-100 group-hover/overflow-tools:visible group-hover/overflow-tools:pointer-events-auto",
              "hover:opacity-100 hover:visible hover:pointer-events-auto",
              activeSubmenu === "tools" &&
                "opacity-100 visible pointer-events-auto",
            )}
          >
            <ToolsContextMenu
              onClose={closeOverflowMenus}
              onShowSkills={handleShowSkills}
              onShowHooks={handleShowHooks}
              onShowAgentTools={handleShowAgentTools}
              shouldShowAgentTools={shouldShowAgentTools}
              shouldShowHooks={shouldShowHooks}
            />
          </div>
        </div>
      )}
      {isCloud && !showCodeInline && (
        <div className="relative group/overflow-agent">
          <ContextMenuListItem
            testId="overflow-agent-button"
            onClick={() =>
              setActiveSubmenu((current) =>
                current === "agent" ? null : "agent",
              )
            }
            isDisabled={isAgentSwitcherDisabled}
            className={contextMenuListItemClassName}
          >
            <ToolsContextMenuIconText
              icon={<CodePillIcon className="h-[11px] w-[11px]" />}
              text={
                conversationMode === "code"
                  ? t(I18nKey.COMMON$CODE)
                  : t(I18nKey.COMMON$PLAN)
              }
              rightIcon={<CarretRightFillIcon width={10} height={10} />}
              className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
            />
          </ContextMenuListItem>
          {!isAgentSwitcherDisabled && (
            <div
              className={cn(
                "absolute left-full top-[-4px] z-60 opacity-0 invisible pointer-events-none transition-all duration-200 ml-[1px]",
                "group-hover/overflow-agent:opacity-100 group-hover/overflow-agent:visible group-hover/overflow-agent:pointer-events-auto",
                "hover:opacity-100 hover:visible hover:pointer-events-auto",
                activeSubmenu === "agent" &&
                  "opacity-100 visible pointer-events-auto",
              )}
            >
              <ContextMenu
                testId="overflow-agent-submenu"
                className="overflow-visible min-w-[195px]"
              >
                <ContextMenuListItem
                  testId="overflow-agent-code"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setConversationMode("code");
                    closeOverflowMenus();
                  }}
                  className={contextMenuListItemClassName}
                >
                  <ToolsContextMenuIconText
                    icon={<CodePillIcon className="h-[11px] w-[11px]" />}
                    text={t(I18nKey.COMMON$CODE)}
                    className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
                  />
                </ContextMenuListItem>
                <ContextMenuListItem
                  testId="overflow-agent-plan"
                  onClick={(event) => {
                    handlePlanClick(event);
                    closeOverflowMenus();
                  }}
                  className={contextMenuListItemClassName}
                >
                  <ToolsContextMenuIconText
                    icon={
                      <LessonPlanIcon
                        width={16}
                        height={16}
                        color="currentColor"
                      />
                    }
                    text={t(I18nKey.COMMON$PLAN)}
                    className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
                  />
                </ContextMenuListItem>
              </ContextMenu>
            </div>
          )}
        </div>
      )}
      {!showModelInline && (
        <div className="relative group/overflow-model">
          <ContextMenuListItem
            testId="overflow-model-button"
            onClick={() =>
              setActiveSubmenu((current) =>
                current === "model" ? null : "model",
              )
            }
            className={contextMenuListItemClassName}
          >
            <ToolsContextMenuIconText
              icon={<Cpu width={16} height={16} strokeWidth={2} aria-hidden />}
              text="Model"
              rightIcon={<CarretRightFillIcon width={10} height={10} />}
              className={CONTEXT_MENU_ICON_TEXT_CLASSNAME}
            />
          </ContextMenuListItem>
          <div
            className={cn(
              "absolute left-full top-[-4px] z-60 opacity-0 invisible pointer-events-none transition-all duration-200 ml-[1px]",
              "group-hover/overflow-model:opacity-100 group-hover/overflow-model:visible group-hover/overflow-model:pointer-events-auto",
              "hover:opacity-100 hover:visible hover:pointer-events-auto",
              activeSubmenu === "model" &&
                "opacity-100 visible pointer-events-auto",
            )}
          >
            <ContextMenu
              testId="overflow-model-submenu"
              className="overflow-visible min-w-[220px] max-w-[320px]"
            >
              <li className="text-sm">
                <div className="p-2 leading-5 text-white break-all">
                  {conversation?.llm_model}
                </div>
              </li>
              <Divider />
              <li className="text-sm">
                <NavigationLink
                  to="/settings"
                  onClick={closeOverflowMenus}
                  className="flex h-[30px] items-center gap-2 rounded p-2 leading-5 text-white hover:bg-[var(--oh-interactive-hover)] transition-colors"
                >
                  <SettingsGearIcon
                    width={16}
                    height={16}
                    className="shrink-0"
                    aria-hidden
                  />
                  <span>{t(I18nKey.SETTINGS$LLM_SETTINGS)}</span>
                </NavigationLink>
              </li>
            </ContextMenu>
          </div>
        </div>
      )}
    </ContextMenu>
  );

  return (
    <div
      ref={actionsRowRef}
      className="w-full min-w-0 flex items-center justify-between gap-2"
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex min-w-0 items-center gap-3">
          <div ref={addFileRef} className={cn(!showAddFileInline && "hidden")}>
            <ChatAddFileButton
              disabled={disabled}
              handleFileIconClick={onAddFileClick}
            />
          </div>
          <div ref={toolsRef} className={cn(!showToolsInline && "hidden")}>
            <Tools />
          </div>
          {isCloud && (
            <div ref={codeRef} className={cn(!showCodeInline && "hidden")}>
              <ChangeAgentButton />
            </div>
          )}
          <div ref={modelRef} className={cn(!showModelInline && "hidden")}>
            <ChatInputModel />
          </div>

          {hasOverflowItems && (
            <div className="relative shrink-0">
              <button
                ref={overflowTriggerRef}
                type="button"
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[var(--oh-muted)] transition-colors",
                  "hover:bg-white/10 hover:text-white cursor-pointer",
                )}
                aria-label="More input actions"
                aria-expanded={isOverflowOpen}
                aria-haspopup="menu"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsOverflowOpen((open) => !open);
                }}
              >
                <ThreeDotsVerticalIcon
                  width={16}
                  height={16}
                  color="currentColor"
                />
              </button>

              {isOverflowOpen &&
                typeof document !== "undefined" &&
                overflowPortalStyle &&
                ReactDOM.createPortal(
                  <div style={overflowPortalStyle}>{overflowMenu}</div>,
                  document.body,
                )}
            </div>
          )}
        </div>
      </div>
      <div
        ref={rightSectionRef}
        className="ml-auto flex shrink-0 items-center gap-2"
      >
        {showAgentStatusInline && (
          <AgentStatus
            handleStop={handlePauseAgent}
            handleResumeAgent={handleResumeAgentClick}
            disabled={disabled}
            isPausing={isPausing}
          />
        )}
        {showButton && (
          <ChatSendButton
            buttonClassName={buttonClassName}
            handleSubmit={handleSubmit}
            disabled={disabled || !canSubmit}
          />
        )}
      </div>

      <SystemMessageModal
        isOpen={systemModalVisible}
        onClose={() => setSystemModalVisible(false)}
        systemMessage={systemMessage || null}
      />
      {skillsModalVisible && (
        <SkillsModal onClose={() => setSkillsModalVisible(false)} />
      )}
      {hooksModalVisible && (
        <HooksModal onClose={() => setHooksModalVisible(false)} />
      )}
    </div>
  );
}
