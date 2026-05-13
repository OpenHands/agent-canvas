import React from "react";
import { useTranslation } from "react-i18next";
import ArrowDown from "#/icons/angle-down-solid.svg?react";
import ArrowUp from "#/icons/angle-up-solid.svg?react";
import LightbulbIcon from "#/icons/lightbulb.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { MarkdownRenderer } from "../../../features/markdown/markdown-renderer";

interface CollapsibleThinkingProps {
  /** The thinking / reasoning content to display when expanded. */
  content: string;
}

/**
 * Renders agent thinking or extended reasoning content inside a collapsible
 * section.  Collapsed by default so the chat stays compact — especially
 * useful when the thinking language differs from the conversation language.
 */
export function CollapsibleThinking({ content }: CollapsibleThinkingProps) {
  const { t } = useTranslation("openhands");
  const [expanded, setExpanded] = React.useState(false);

  if (!content.trim()) {
    return null;
  }

  const Chevron = expanded ? ArrowUp : ArrowDown;

  return (
    <div
      className="my-2 w-full border-l-2 border-neutral-300 pl-2 py-2 text-sm"
      data-testid="collapsible-thinking"
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={
          expanded ? t(I18nKey.THINKING$COLLAPSE) : t(I18nKey.THINKING$EXPAND)
        }
        data-testid="collapsible-thinking-toggle"
        className="w-full flex items-center gap-2 text-left cursor-pointer"
      >
        <Chevron className="h-4 w-4 fill-neutral-300 flex-shrink-0" />
        <LightbulbIcon className="h-4 w-4 fill-neutral-300 flex-shrink-0" />
        <span className="font-bold text-neutral-300">
          {t(I18nKey.THINKING$TITLE)}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 pl-6" data-testid="collapsible-thinking-content">
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>
      )}
    </div>
  );
}
