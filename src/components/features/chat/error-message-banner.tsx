import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { CircleX, X } from "lucide-react";
import { OH_STATUS_ERROR_COLOR } from "#/constants/status-colors";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

interface ErrorMessageBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

const DEFAULT_MAX_COLLAPSED_CHARS = 220;

export function ErrorMessageBanner({
  message,
  onDismiss,
  onRetry,
}: ErrorMessageBannerProps) {
  const { t, i18n } = useTranslation("openhands");
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isMultiLine, setIsMultiLine] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const isI18nKey = i18n.exists(message, { ns: "openhands" });
  const displayTextForLength = isI18nKey ? String(t(message)) : message;
  const shouldShowToggle =
    displayTextForLength.length > DEFAULT_MAX_COLLAPSED_CHARS;

  const isCollapsed = shouldShowToggle && !isExpanded;

  React.useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) {
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
  }, [displayTextForLength, isCollapsed, isExpanded, message]);

  return (
    <div
      className={cn(
        "flex w-full gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] p-2 text-[var(--oh-foreground)]",
        isMultiLine ? "items-start" : "items-center",
      )}
      data-testid="error-message-banner"
    >
      <CircleX
        aria-hidden
        className="h-4 w-4 shrink-0"
        strokeWidth={2}
        style={{ color: OH_STATUS_ERROR_COLOR }}
        data-testid="error-message-banner-icon"
      />
      <div className="min-w-0 flex-1">
        <div
          ref={contentRef}
          className={cn(
            "whitespace-pre-wrap break-words text-sm text-[var(--oh-muted)]",
            isCollapsed && "line-clamp-3",
          )}
          data-testid="error-message-banner-content"
        >
          {isI18nKey ? <Trans ns="openhands" i18nKey={message} /> : message}
        </div>

        {shouldShowToggle && (
          <button
            type="button"
            className="mt-1 cursor-pointer text-xs font-normal text-[var(--oh-foreground)] underline"
            onClick={() => setIsExpanded((prev) => !prev)}
            data-testid="error-message-banner-toggle"
          >
            {isExpanded
              ? t(I18nKey.COMMON$VIEW_LESS)
              : t(I18nKey.COMMON$VIEW_MORE)}
          </button>
        )}
      </div>

      <div
        className={cn(
          "flex shrink-0 gap-1",
          isMultiLine ? "self-start" : "items-center",
        )}
      >
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded-md border border-[var(--oh-border)] px-2 py-1 text-xs font-normal text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]"
            data-testid="error-message-banner-retry"
          >
            {t(I18nKey.CHAT_INTERFACE$MESSAGE_RETRY)}
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 cursor-pointer rounded-md p-1 text-[var(--oh-muted)] hover:bg-[var(--oh-interactive-hover)] hover:text-[var(--oh-foreground)]"
            aria-label={t(I18nKey.BUTTON$CLOSE)}
            data-testid="error-message-banner-dismiss"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
