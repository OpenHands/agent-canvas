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
      <div className="rounded-xl bg-neutral-900/50">
        <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-200">
          {prompt}
        </p>
      </div>
    </SectionCard>
  );
}
