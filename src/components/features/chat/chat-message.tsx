import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { CopyToClipboardButton } from "#/components/shared/buttons/copy-to-clipboard-button";
import type { SourceType } from "#/types/agent-server/core/base/common";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { I18nKey } from "#/i18n/declaration";
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
}

export function ChatMessage({
  type,
  message,
  children,
  actions,
  isFromPlanningAgent = false,
  pendingStatus,
  onRetry,
}: React.PropsWithChildren<ChatMessageProps>) {
  const { t } = useTranslation("openhands");
  const [isHovering, setIsHovering] = React.useState(false);
  const [isCopy, setIsCopy] = React.useState(false);

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

  return (
    <article
      data-testid={`${type}-message`}
      data-pending-status={pendingStatus}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={cn(
        "rounded-xl relative w-fit max-w-full last:mb-4",
        "flex flex-col gap-2",
        type === "user" && "p-4 bg-tertiary self-end",
        type === "agent" && "mt-6 w-full max-w-full bg-transparent",
        isFromPlanningAgent &&
          type === "agent" &&
          "border border-[#597ff4] bg-tertiary p-4 mt-2",
        pendingStatus === "sending" && "opacity-60",
        pendingStatus === "error" && "border border-status-fail-border",
      )}
    >
      <div
        className={cn(
          "absolute -top-2.5 -right-2.5",
          !isHovering ? "hidden" : "flex",
          "items-center gap-1",
        )}
      >
        {actions?.map((action, index) =>
          action.tooltip ? (
            <StyledTooltip key={index} content={action.tooltip} placement="top">
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
        className="text-sm"
        style={{
          whiteSpace: "normal",
          wordBreak: "break-word",
        }}
      >
        <MarkdownRenderer includeStandard includeHeadings>
          {message}
        </MarkdownRenderer>
      </div>

      {pendingStatus === "sending" && (
        <span
          role="status"
          aria-live="polite"
          data-testid="chat-message-sending"
          className="self-end text-xs italic text-content-muted"
        >
          {t(I18nKey.CHAT_INTERFACE$MESSAGE_SENDING)}
        </span>
      )}

      {pendingStatus === "error" && (
        <span
          role="alert"
          data-testid="chat-message-error"
          className="self-end text-xs text-status-fail-text"
        >
          {t(I18nKey.CHAT_INTERFACE$MESSAGE_SEND_FAILED)}{" "}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="underline cursor-pointer"
              data-testid="chat-message-retry"
            >
              {t(I18nKey.CHAT_INTERFACE$MESSAGE_RETRY)}
            </button>
          )}
        </span>
      )}

      {children}
    </article>
  );
}
