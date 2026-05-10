import React from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { LlmSettingsScreen } from "#/routes/llm-settings";

interface SetupLlmStepProps {
  onBack: () => void;
  onNext: () => void;
}

/**
 * Step 2: embed the LLM settings form. The user lands on the basic
 * view (provider/model + API key). Defaults come from
 * `DEFAULT_SETTINGS` (Anthropic / Claude Opus). Saving advances; the
 * user can also Skip if they want to come back later.
 */
export function SetupLlmStep({ onBack, onNext }: SetupLlmStepProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="onboarding-step-setup-llm"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-white">
          {t(I18nKey.ONBOARDING$LLM_TITLE)}
        </h2>
        <p className="text-sm text-gray-400">
          {t(I18nKey.ONBOARDING$LLM_SUBTITLE)}
        </p>
      </header>

      <div
        data-testid="onboarding-llm-settings"
        className="max-h-[420px] overflow-y-auto custom-scrollbar-always pr-2"
      >
        <LlmSettingsScreen onSaveSuccess={onNext} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <BrandButton
          testId="onboarding-llm-back"
          type="button"
          variant="secondary"
          onClick={onBack}
        >
          {t(I18nKey.ONBOARDING$BACK)}
        </BrandButton>
        <BrandButton
          testId="onboarding-llm-next"
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
