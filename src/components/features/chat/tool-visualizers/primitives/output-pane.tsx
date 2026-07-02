import React from "react";
import { useTranslation } from "react-i18next";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { I18nKey } from "#/i18n/declaration";
import { CopyableContentWrapper } from "#/components/shared/buttons/copyable-content-wrapper";
import { MAX_CONTENT_LENGTH } from "#/components/conversation-events/chat/event-content-helpers/shared";
import { SyntaxHighlighter } from "../../../markdown/syntax-highlighter";

interface OutputPaneProps {
  output: string;
  /** Process exit code, when known. `0` and `-1` (timeout) are not badged —
   *  the card's success indicator already conveys those. */
  exitCode?: number | null;
  /** Show a hover copy button that yields the full, untruncated output.
   *  Defaults to true; suppressed automatically when there is no output. */
  copy?: boolean;
}

/**
 * Monospace output block for command results, with a failure exit-code badge
 * and an optional hover copy button. Long content is truncated in the display
 * to the same limit the markdown path uses, with an inline control to reveal
 * the full output. The copy button always yields the untruncated output.
 */
export function OutputPane({ output, exitCode, copy = true }: OutputPaneProps) {
  const { t } = useTranslation("openhands");
  const [isExpanded, setIsExpanded] = React.useState(false);
  const isTruncated = output.length > MAX_CONTENT_LENGTH;
  const display =
    isTruncated && !isExpanded
      ? `${output.slice(0, MAX_CONTENT_LENGTH)}…`
      : output;
  const text = display.trim();
  const showExitBadge = exitCode != null && exitCode !== 0 && exitCode !== -1;
  const toggleLabel = isExpanded
    ? t(I18nKey.BUTTON$COLLAPSE)
    : t(I18nKey.BUTTON$EXPAND);

  const pane = (
    <SyntaxHighlighter
      className="rounded-lg text-xs"
      style={vscDarkPlus}
      language="sh"
      PreTag="div"
    >
      {text || t(I18nKey.OBSERVATION$COMMAND_NO_OUTPUT)}
    </SyntaxHighlighter>
  );

  return (
    <div className="flex flex-col gap-1">
      {showExitBadge && (
        <span className="self-start rounded bg-status-fail-bg px-1.5 py-0.5 font-mono text-xs text-status-fail-text">
          {t(I18nKey.OBSERVATION$EXIT_CODE, { code: exitCode })}
        </span>
      )}
      {copy && text ? (
        <CopyableContentWrapper text={output}>{pane}</CopyableContentWrapper>
      ) : (
        pane
      )}
      {isTruncated && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="self-start text-xs text-[var(--oh-muted)] transition-colors hover:text-white hover:underline"
          aria-label={toggleLabel}
        >
          {toggleLabel}
        </button>
      )}
    </div>
  );
}
