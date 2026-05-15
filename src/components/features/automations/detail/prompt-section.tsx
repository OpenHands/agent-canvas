import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import TerminalIcon from "#/icons/terminal.svg?react";
import { SectionCard } from "./section-card";

interface PromptSectionProps {
  prompt: string;
}

export function PromptSection({ prompt }: PromptSectionProps) {
  const { t } = useTranslation("openhands");

  return (
    <SectionCard
      icon={<TerminalIcon className="size-4" />}
      title={t(I18nKey.AUTOMATIONS$DETAIL$PROMPT)}
    >
      <div className="rounded-xl bg-[var(--oh-surface-deep)]">
        <p className="whitespace-pre-wrap text-sm leading-6 text-content">
          {prompt}
        </p>
      </div>
    </SectionCard>
  );
}
