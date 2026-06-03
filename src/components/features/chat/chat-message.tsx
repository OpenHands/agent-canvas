import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { CopyToClipboardButton } from "#/components/shared/buttons/copy-to-clipboard-button";
import type { SourceType } from "#/types/agent-server/core/base/common";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { I18nKey } from "#/i18n/declaration";
import PauseIcon from "#/icons/pause.svg?react";
import { MarkdownRenderer } from "../markdown/markdown-renderer";

export type ChatMessagePendingStatus = "sending" | "error";

interface ChatMessageProps {
  type: SourceType;
  message: string;
  actions?: Array<{
    icon: React.ReactNode;
    onClick: () => void;
    tooltip?: string;
  }>;
  isFromPlanningAgent?: boolean;
  pendingStatus?: ChatMessagePendingStatus;
  onRetry?: () => void;
  onStop?: () => void;
}

export function ChatMessage({
  type,
  message,
  children,
  actions,
  isFromPlanningAgent = false,
  pendingStatus,
  onRetry,
  onStop,
}: React.PropsWithChildren<ChatMessageProps>) {
  const { t } = useTranslation("openhands");
  const [isHovering, setIsHovering] = React.useState(false);
  const [isCopy, setIsCopy] = React.useState(false);
  const [isMultiLine, setIsMultiLine] = React.useState(false);
  const messageContentRef = React.useRef<HTMLDivElement>(null);

  const handleCopyToClipboard = async () => {
    await navigator.clipboard.writeText(message);
    setIsCopy(true);
  };

  React.useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (isCopy) {
      timeout = setTimeout(() => {
        setIsCopy(false);
      }, 2000);
    }

    return () => {
      clearTimeout(timeout);
    };
  }, [isCopy]);

  React.useLayoutEffect(() => {
    const content = messageContentRef.current;
    if (!content || pendingStatus !== "sending") {
      setIsMultiLine(false);
      return undefined;
    }

    const updateIsMultiLine = () => {
      const lineHeight = Number.parseFloat(
        getComputedStyle(content).lineHeight,
      );
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        setIsMultiLine(false);
        return;
      }

      setIsMultiLine(content.getBoundingClientRect().height > lineHeight * 1.5);
    };

    updateIsMultiLine();

    const observer = new ResizeObserver(updateIsMultiLine);
    observer.observe(content);

    return () => observer.disconnect();
  }, [message, pendingStatus]);

  const isPendingUserMessage =
    type === "user" &&
    (pendingStatus === "error" || pendingStatus === "sending");
  const showStopButton =
    pendingStatus === "sending" && onStop != null && isHovering;

  const messageBubble = (
    <div
      className={cn("relative w-fit max-w-full", type === "user" && "self-end")}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <article
        data-testid={`${type}-message`}
        data-pending-status={pendingStatus}
        className={cn(
          "rounded-xl relative w-fit max-w-full",
          "flex flex-col gap-2",
          type === "user" && "p-4 bg-tertiary",
          type === "agent" && "mt-6 w-full max-w-full bg-transparent",
          isFromPlanningAgent &&
            type === "agent" &&
            "border border-[#597ff4] bg-tertiary p-4 mt-2",
          pendingStatus === "sending" &&
            (isHovering
              ? "opacity-100 bg-[var(--oh-interactive-hover)]"
              : "opacity-60"),
          pendingStatus === "error" &&
            "border border-[var(--oh-status-error)]/40",
          !isPendingUserMessage && "last:mb-4",
        )}
      >
        <div
          className={cn(
            "absolute -top-2.5 -right-2.5",
            !isHovering || pendingStatus === "sending" ? "hidden" : "flex",
            "items-center gap-1",
          )}
        >
          {actions?.map((action, index) =>
            action.tooltip ? (
              <StyledTooltip
                key={index}
                content={action.tooltip}
                placement="top"
              >
                <button
                  type="button"
                  onClick={action.onClick}
                  className="button-base p-1 cursor-pointer"
                  aria-label={action.tooltip}
                >
                  {action.icon}
                </button>
              </StyledTooltip>
            ) : (
              <button
                key={index}
                type="button"
                onClick={action.onClick}
                className="button-base p-1 cursor-pointer"
                aria-label={`Action ${index + 1}`}
              >
                {action.icon}
              </button>
            ),
          )}

          <CopyToClipboardButton
            isHidden={!isHovering}
            isDisabled={isCopy}
            onClick={handleCopyToClipboard}
            mode={isCopy ? "copied" : "copy"}
          />
        </div>

        <div
          ref={messageContentRef}
          className="text-sm whitespace-normal [word-break:break-word]"
        >
          <MarkdownRenderer includeStandard includeHeadings>
            {message}
          </MarkdownRenderer>
        </div>

        {children}
      </article>

      {showStopButton ? (
        <button
          type="button"
          onClick={onStop}
          data-testid="chat-message-stop"
          aria-label={t(I18nKey.BUTTON$STOP)}
          className={cn(
            "absolute button-base cursor-pointer rounded-md p-1 text-[var(--oh-foreground)] hover:bg-[var(--oh-surface-raised)]",
            isMultiLine
              ? "bottom-2 right-2"
              : "-right-2.5 top-1/2 -translate-y-1/2",
          )}
        >
          <PauseIcon className="block h-4 w-4 max-w-none text-current" />
        </button>
      ) : null}
    </div>
  );

  if (type === "user" && pendingStatus === "error") {
    return (
      <div className="flex w-fit max-w-full flex-col items-end gap-1.5 self-end last:mb-4">
        {messageBubble}
        <div
          role="alert"
          data-testid="chat-message-error"
          className="flex items-center gap-2 text-xs text-[var(--oh-status-error)]"
        >
          <span>{t(I18nKey.CHAT_INTERFACE$MESSAGE_SEND_FAILED)}</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="cursor-pointer rounded-md border border-[var(--oh-border)] px-2 py-1 text-xs font-normal text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
              data-testid="chat-message-retry"
            >
              {t(I18nKey.CHAT_INTERFACE$MESSAGE_RETRY)}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (type === "user" && pendingStatus === "sending") {
    return (
      <div className="flex w-full max-w-full flex-col gap-1.5 last:mb-4">
        {messageBubble}
        <span
          role="status"
          aria-live="polite"
          data-testid="chat-message-sending"
          className="text-xs italic text-content-muted"
        >
          {t(I18nKey.CHAT_INTERFACE$MESSAGE_SENDING)}
        </span>
      </div>
    );
  }

  return messageBubble;
}
