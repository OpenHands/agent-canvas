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
 * Pre-fills the LLM form with Anthropic / Claude Opus when the user
 * lands on this onboarding step. The global `DEFAULT_SETTINGS` ships
 * the OpenHands-prefixed Opus, but the onboarding spec calls for
 * routing directly through Anthropic, and these overrides are also
 * marked dirty so the Save Changes button is enabled immediately.
 */
const ONBOARDING_LLM_OVERRIDES = {
  "llm.model": "anthropic/claude-opus-4-5-20251101",
} as const;

/**
 * Step 2: embed the LLM settings form. The screen runs in `embedded`
 * mode so its Save button renders inline (rather than as a sticky
 * `bg-base` band that visually breaks the modal). On a successful
 * save we advance to the next step — there is no separate Next
 * button, since saving the form *is* the act of moving on.
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

      <div data-testid="onboarding-llm-settings">
        <LlmSettingsScreen
          embedded
          initialValueOverrides={ONBOARDING_LLM_OVERRIDES}
          onSaveSuccess={onNext}
        />
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
        <button
          type="button"
          data-testid="onboarding-llm-skip"
          onClick={onNext}
          className="text-xs text-gray-400 hover:text-white"
        >
          {t(I18nKey.ONBOARDING$SKIP)}
        </button>
      </div>
    </div>
  );
}
