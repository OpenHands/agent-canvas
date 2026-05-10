import React from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { LlmSettingsScreen } from "#/routes/llm-settings";
import type { SdkSectionSaveControl } from "#/components/features/settings/sdk-settings/sdk-section-page";

interface SetupLlmStepProps {
  onBack: () => void;
  onNext: () => void;
}

/**
 * Pre-fills the LLM form with Anthropic / Claude Opus when the user
 * lands on this onboarding step. The global `DEFAULT_SETTINGS` ships
 * the OpenHands-prefixed Opus, but the onboarding spec calls for
 * routing directly through Anthropic, and these overrides are also
 * marked dirty so the Next button is enabled immediately.
 */
const ONBOARDING_LLM_OVERRIDES = {
  "llm.model": "anthropic/claude-opus-4-5-20251101",
} as const;

/**
 * Step 2: embed the LLM settings form. The screen runs in `embedded`
 * mode (so it doesn't render its own sticky Save bar) and with
 * `hideSaveButton` set, surfacing its save state via
 * `onSaveControlChange`. We then render a single Next button at the
 * modal footer level matching the other onboarding steps; clicking
 * Next saves the form and `onSaveSuccess` advances to the next step.
 *
 * If the form happens to be untouched (no dirty fields), Next falls
 * through to advancing without a save call, so users with already-
 * configured settings aren't blocked.
 */
export function SetupLlmStep({ onBack, onNext }: SetupLlmStepProps) {
  const { t } = useTranslation("openhands");
  const [saveControl, setSaveControl] =
    React.useState<SdkSectionSaveControl | null>(null);

  const handleNext = () => {
    if (saveControl?.isDirty) {
      saveControl.save();
      // `onSaveSuccess` (wired to `onNext` below) will advance once
      // the mutation resolves successfully.
      return;
    }
    onNext();
  };

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
          hideSaveButton
          initialValueOverrides={ONBOARDING_LLM_OVERRIDES}
          onSaveSuccess={onNext}
          onSaveControlChange={setSaveControl}
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
        <BrandButton
          testId="onboarding-llm-next"
          type="button"
          variant="primary"
          isDisabled={saveControl?.isSaving ?? false}
          onClick={handleNext}
        >
          {t(I18nKey.ONBOARDING$NEXT)}
        </BrandButton>
      </div>
    </div>
  );
}
