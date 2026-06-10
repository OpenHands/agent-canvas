import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

type BrowserChromeBarProps = {
  url: string;
  hasPage: boolean;
};

export function BrowserChromeBar({ url, hasPage }: BrowserChromeBarProps) {
  const { t } = useTranslation("openhands");

  const navButtonClassName = cn(
    "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md",
    hasPage
      ? "text-[var(--oh-text-tertiary)] cursor-default"
      : "text-[var(--oh-text-tertiary)] opacity-40 cursor-not-allowed",
  );

  const iconClassName = "w-3.5 h-3.5";

  return (
    <div
      className="flex w-full min-h-[34px] shrink-0 items-center gap-1 border-b border-[var(--oh-border)] px-2 py-1.5"
      data-testid="browser-chrome-bar"
    >
      <button
        type="button"
        disabled={!hasPage}
        aria-label={t(I18nKey.BUTTON$BACK)}
        title={t(I18nKey.BUTTON$BACK)}
        className={navButtonClassName}
      >
        <ChevronLeft className={iconClassName} aria-hidden strokeWidth={2} />
      </button>
      <button
        type="button"
        disabled={!hasPage}
        aria-label={t(I18nKey.BROWSER$GO_FORWARD)}
        title={t(I18nKey.BROWSER$GO_FORWARD)}
        className={navButtonClassName}
      >
        <ChevronRight className={iconClassName} aria-hidden strokeWidth={2} />
      </button>
      <button
        type="button"
        disabled={!hasPage}
        aria-label={t(I18nKey.BUTTON$REFRESH)}
        title={t(I18nKey.BUTTON$REFRESH)}
        className={navButtonClassName}
      >
        <RotateCw className={iconClassName} aria-hidden strokeWidth={2} />
      </button>

      <div
        className={cn(
          "flex min-h-7 min-w-0 flex-1 items-center rounded-md border border-[var(--oh-border)]",
          "bg-[var(--oh-surface-raised)] px-2 text-xs leading-5",
          url ? "text-[var(--oh-text-tertiary)]" : "text-[var(--oh-text-dim)]",
        )}
        data-testid="browser-chrome-url"
        title={url || undefined}
      >
        <span className="truncate">
          {url || t(I18nKey.BROWSER$URL_PLACEHOLDER)}
        </span>
      </div>

      {hasPage && url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          data-testid="browser-chrome-open-external"
          className={cn(
            "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md",
            "text-[var(--oh-text-tertiary)] hover:bg-tertiary cursor-pointer",
          )}
        >
          <ExternalLink className={iconClassName} aria-hidden strokeWidth={2} />
        </a>
      ) : (
        <button
          type="button"
          disabled
          aria-label={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          className={navButtonClassName}
        >
          <ExternalLink className={iconClassName} aria-hidden strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
