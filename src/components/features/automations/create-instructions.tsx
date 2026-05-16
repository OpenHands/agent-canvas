import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, GitBranch, Inbox, Package } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SuggestedAutomationsCatalogModal } from "#/components/features/automations/suggested-automations-catalog-modal";
import TerminalIcon from "#/icons/terminal.svg?react";
import SparkleIcon from "#/icons/sparkle.svg?react";
import ChevronDownIcon from "#/icons/chevron-down.svg?react";

const DOCS_URL =
  "https://docs.openhands.dev/openhands/usage/automations/overview";
const NEW_CONVERSATION_URL = "/";
const PLUGIN_COMMAND = "/openhands-automation create";
const PLUGIN_INSTALL_URL =
  "https://github.com/OpenHands/extensions#quick-start";

export const SUGGESTED_AUTOMATION_CARD_CLASS =
  "group flex flex-col rounded-xl border border-[var(--oh-border)] bg-base-secondary p-4 transition-colors hover:border-[var(--cool-grey-500)] hover:bg-base-tertiary/30";

const SUGGESTED_MODULES: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  titleKey: I18nKey;
  descriptionKey: I18nKey;
}[] = [
  {
    icon: GitBranch,
    titleKey: I18nKey.AUTOMATIONS$SUGGESTED_CI_TITLE,
    descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_CI_DESC,
  },
  {
    icon: Package,
    titleKey: I18nKey.AUTOMATIONS$SUGGESTED_DEPS_TITLE,
    descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_DEPS_DESC,
  },
  {
    icon: Inbox,
    titleKey: I18nKey.AUTOMATIONS$SUGGESTED_STALE_TITLE,
    descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_STALE_DESC,
  },
  {
    icon: FileText,
    titleKey: I18nKey.AUTOMATIONS$SUGGESTED_RELEASE_TITLE,
    descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_RELEASE_DESC,
  },
];

interface CreateInstructionsProps {
  /** If true, the instructions are collapsible and start collapsed */
  collapsible?: boolean;
}

function SuggestedAutomations() {
  const { t } = useTranslation("openhands");
  const [catalogOpen, setCatalogOpen] = useState(false);

  return (
    <div className="mt-6 w-full">
      <h4 className="mb-4 text-left text-sm font-medium text-content">
        {t(I18nKey.AUTOMATIONS$SUGGESTED_SECTION_TITLE)}
      </h4>
      <div className="grid gap-4 sm:grid-cols-2">
        {SUGGESTED_MODULES.map(
          ({ icon: Icon, titleKey, descriptionKey }, index) => (
            <div
              key={`${String(titleKey)}-${index}`}
              className={SUGGESTED_AUTOMATION_CARD_CLASS}
              role="group"
              aria-label={t(titleKey)}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary text-muted"
                >
                  <Icon className="size-5" strokeWidth={2} aria-hidden />
                </span>
                <span className="text-sm font-medium text-content">
                  {t(titleKey)}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">{t(descriptionKey)}</p>
            </div>
          ),
        )}
      </div>
      <BrandButton
        type="button"
        variant="secondary"
        className="mt-4 w-full sm:w-auto"
        testId="suggested-automations-view-more"
        onClick={() => setCatalogOpen(true)}
      >
        {t(I18nKey.AUTOMATIONS$SUGGESTED_VIEW_MORE)}
      </BrandButton>

      {catalogOpen ? (
        <SuggestedAutomationsCatalogModal
          suggestedCardClass={SUGGESTED_AUTOMATION_CARD_CLASS}
          onClose={() => setCatalogOpen(false)}
        />
      ) : null}
    </div>
  );
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
        <div className="rounded-xl border border-[var(--oh-border)] bg-base-secondary p-4">
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
        <div className="rounded-xl border border-[var(--oh-border)] bg-base-secondary p-4">
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

      <SuggestedAutomations />
    </>
  );

  if (collapsible) {
    return (
      <div className="w-full rounded-xl border border-[var(--oh-border)] bg-base-secondary">
        <div className="flex w-full items-center gap-3 p-4">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg py-1 text-left transition-colors hover:bg-surface-raised"
          >
            <span className="truncate text-sm font-medium text-content">
              {t(I18nKey.AUTOMATIONS$EMPTY_HOW_TO_CREATE_TITLE)}
            </span>
            <ChevronDownIcon
              className={`size-5 shrink-0 text-muted transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-sm text-muted hover:text-foreground transition-colors"
          >
            {t(I18nKey.AUTOMATIONS$EMPTY_LEARN_MORE)}
          </a>
        </div>
        {isExpanded && <div className="px-4 pb-4">{content}</div>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-left text-sm font-medium text-content">
          {t(I18nKey.AUTOMATIONS$EMPTY_HOW_TO_CREATE_TITLE)}
        </h3>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          {t(I18nKey.AUTOMATIONS$EMPTY_LEARN_MORE)}
        </a>
      </div>
      {content}
    </div>
  );
}
