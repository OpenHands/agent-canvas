import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import TerminalIcon from "#/icons/terminal.svg?react";
import SparkleIcon from "#/icons/sparkle.svg?react";
import ChevronDownIcon from "#/icons/chevron-down.svg?react";

const DOCS_URL =
  "https://docs.openhands.dev/openhands/usage/automations/overview";
const NEW_CONVERSATION_URL = "/";
const PLUGIN_COMMAND = "/openhands-automation create";
const PLUGIN_INSTALL_URL =
  "https://github.com/OpenHands/extensions#quick-start";

interface CreateInstructionsProps {
  /** If true, the instructions are collapsible and start collapsed */
  collapsible?: boolean;
}

export function CreateInstructions({
  collapsible = false,
}: CreateInstructionsProps) {
  const { t } = useTranslation("openhands");
  const [isExpanded, setIsExpanded] = useState(!collapsible);

  const content = (
    <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Option 1: Claude Code / Codex */}
        <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
          <div className="flex items-center gap-2">
            <TerminalIcon className="size-5 text-muted" />
            <span className="text-sm font-medium text-content">
              {t(I18nKey.AUTOMATIONS$EMPTY_OPTION_PLUGIN_TITLE)}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            <a
              href={PLUGIN_INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              {t(I18nKey.AUTOMATIONS$EMPTY_INSTALL_PLUGIN)}
            </a>{" "}
            {t(I18nKey.AUTOMATIONS$EMPTY_OPTION_PLUGIN_DESC)}
          </p>
          <code className="mt-2 block rounded bg-surface-raised px-3 py-2 font-mono text-xs text-content">
            {PLUGIN_COMMAND}
          </code>
        </div>

        {/* Option 2: OpenHands Cloud conversation */}
        <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
          <div className="flex items-center gap-2">
            <SparkleIcon className="size-5 text-muted" />
            <span className="text-sm font-medium text-content">
              {t(I18nKey.AUTOMATIONS$EMPTY_OPTION_CONVERSATION_TITLE)}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {t(I18nKey.AUTOMATIONS$EMPTY_OPTION_CONVERSATION_DESC)}
          </p>
          <a
            href={NEW_CONVERSATION_URL}
            className="mt-2 inline-flex items-center gap-1 rounded-md bg-surface-raised px-3 py-2 text-xs font-medium text-content hover:bg-surface-raised transition-colors"
          >
            {t(I18nKey.AUTOMATIONS$EMPTY_START_CONVERSATION)}
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>

      {/* Documentation link */}
      <p className="mt-4 text-center text-sm text-muted">
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground transition-colors"
        >
          {t(I18nKey.AUTOMATIONS$EMPTY_LEARN_MORE)}
        </a>
      </p>
    </>
  );

  if (collapsible) {
    return (
      <div className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)]">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-surface-raised transition-colors rounded-lg"
        >
          <span className="text-sm font-medium text-content">
            {t(I18nKey.AUTOMATIONS$EMPTY_HOW_TO_CREATE_TITLE)}
          </span>
          <ChevronDownIcon
            className={`size-5 text-muted transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
        {isExpanded && <div className="px-4 pb-4">{content}</div>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      <h3 className="text-center text-sm font-medium text-content">
        {t(I18nKey.AUTOMATIONS$EMPTY_HOW_TO_CREATE_TITLE)}
      </h3>
      {content}
    </div>
  );
}
