import React from "react";
import { useTranslation } from "react-i18next";
import { Check, Sparkles } from "lucide-react";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

export type OnboardingAgentId = "openhands" | "claude-code" | "codex";

interface AgentOption {
  id: OnboardingAgentId;
  label: string;
  descriptionKey: I18nKey;
  enabled: boolean;
}

const AGENT_OPTIONS: AgentOption[] = [
  {
    id: "openhands",
    label: "OpenHands",
    descriptionKey: I18nKey.ONBOARDING$AGENT_OPENHANDS_DESCRIPTION,
    enabled: true,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    descriptionKey: I18nKey.ONBOARDING$AGENT_CLAUDE_CODE_DESCRIPTION,
    enabled: false,
  },
  {
    id: "codex",
    label: "Codex",
    descriptionKey: I18nKey.ONBOARDING$AGENT_CODEX_DESCRIPTION,
    enabled: false,
  },
];

interface ChooseAgentStepProps {
  selectedAgentId: OnboardingAgentId;
  onSelect: (agentId: OnboardingAgentId) => void;
  onNext: () => void;
}

export function ChooseAgentStep({
  selectedAgentId,
  onSelect,
  onNext,
}: ChooseAgentStepProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="onboarding-step-choose-agent"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-white">
          {t(I18nKey.ONBOARDING$AGENT_TITLE)}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.ONBOARDING$AGENT_SUBTITLE)}
        </p>
      </header>

      <div
        role="note"
        data-testid="onboarding-agent-coming-soon"
        className={cn(
          "flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3",
        )}
      >
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm font-medium text-primary">
          {t(I18nKey.ONBOARDING$AGENT_COMING_SOON)}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={t(I18nKey.ONBOARDING$AGENT_TITLE)}
        className="flex flex-col gap-3"
      >
        {AGENT_OPTIONS.map((option) => {
          const isSelected = option.id === selectedAgentId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={!option.enabled}
              disabled={!option.enabled}
              data-testid={`onboarding-agent-option-${option.id}`}
              data-selected={isSelected}
              onClick={() => option.enabled && onSelect(option.id)}
              className={cn(
                "flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors",
                option.enabled
                  ? "cursor-pointer hover:border-primary/60 hover:bg-white/5"
                  : "cursor-not-allowed opacity-50",
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-white/10 bg-base-secondary",
              )}
            >
              <div className="flex flex-col gap-1">
                <span className="text-base font-medium text-white">
                  {option.label}
                </span>
                <span className="text-xs text-[var(--oh-muted)]">
                  {t(option.descriptionKey)}
                </span>
              </div>
              {isSelected ? (
                <Check
                  width={18}
                  height={18}
                  className="mt-1 shrink-0 text-primary"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-0 flex justify-end bg-base-secondary pt-4 pb-7">
        <BrandButton
          testId="onboarding-agent-next"
          type="button"
          variant="primary"
          onClick={onNext}
        >
          {t(I18nKey.ONBOARDING$NEXT)}
        </BrandButton>
      </div>
    </div>
  );
}
