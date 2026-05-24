import React from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { LlmSettingsScreen } from "#/routes/llm-settings";
import type { SdkSectionSaveControl } from "#/components/features/settings/sdk-settings/sdk-section-page";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useSaveLlmProfile } from "#/hooks/mutation/use-save-llm-profile";
import { useActivateLlmProfile } from "#/hooks/mutation/use-activate-llm-profile";
import { deriveProfileNameFromModel } from "#/utils/derive-profile-name";

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
  "llm.model": "anthropic/claude-opus-4-7",
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
  const { backend } = useActiveBackend();
  const isLocalBackend = backend.kind === "local";
  const saveProfile = useSaveLlmProfile();
  const activateProfile = useActivateLlmProfile();
  const [saveControl, setSaveControl] =
    React.useState<SdkSectionSaveControl | null>(null);
  const [isFinalizing, setIsFinalizing] = React.useState(false);

  // On local backends the LLM profiles list is the user-facing source of
  // truth; without this step the form save only updates agent_settings and
  // the new config never shows up in the profiles list ("ghost profile").
  const persistAsProfile = React.useCallback(async () => {
    if (!isLocalBackend || !saveControl) return;
    const values = saveControl.values;
    const model =
      typeof values["llm.model"] === "string" ? values["llm.model"] : "";
    if (!model) return;
    const apiKey =
      typeof values["llm.api_key"] === "string" ? values["llm.api_key"] : "";
    const baseUrl =
      typeof values["llm.base_url"] === "string" ? values["llm.base_url"] : "";

    const name = deriveProfileNameFromModel(model);
    const llmConfig: { model: string; api_key?: string; base_url?: string } = {
      model,
    };
    if (apiKey) llmConfig.api_key = apiKey;
    if (baseUrl) llmConfig.base_url = baseUrl;

    try {
      await saveProfile.mutateAsync({
        name,
        request: { llm: llmConfig, include_secrets: true },
      });
      await activateProfile.mutateAsync(name);
    } catch (error) {
      // Best-effort: the agent_settings save already succeeded, so the
      // user is not blocked from completing onboarding.
      console.error("Failed to persist onboarding LLM as profile:", error);
    }
  }, [isLocalBackend, saveControl, saveProfile, activateProfile]);

  const handleSaveSuccess = React.useCallback(async () => {
    setIsFinalizing(true);
    try {
      await persistAsProfile();
    } finally {
      setIsFinalizing(false);
      onNext();
    }
  }, [persistAsProfile, onNext]);

  const handleNext = () => {
    if (saveControl?.isDirty) {
      saveControl.save();
      // `onSaveSuccess` (wired to `handleSaveSuccess` below) will advance
      // once the mutation resolves successfully.
      return;
    }
    onNext();
  };

  return (
    <div
      data-testid="onboarding-step-setup-llm"
      className="flex flex-col gap-6 max-h-[calc(90vh-7rem)]"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-medium text-white">
          {t(I18nKey.ONBOARDING$LLM_TITLE)}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.ONBOARDING$LLM_SUBTITLE)}
        </p>
      </header>

      <div
        data-testid="onboarding-llm-settings"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar-always"
      >
        <LlmSettingsScreen
          embedded
          hideSaveButton
          initialValueOverrides={ONBOARDING_LLM_OVERRIDES}
          onSaveSuccess={handleSaveSuccess}
          onSaveControlChange={setSaveControl}
        />
      </div>

      <div className="sticky bottom-0 flex items-center justify-end gap-2 bg-base-secondary pt-4 pb-7">
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
          isDisabled={(saveControl?.isSaving ?? false) || isFinalizing}
          onClick={handleNext}
        >
          {t(I18nKey.ONBOARDING$NEXT)}
        </BrandButton>
      </div>
    </div>
  );
}
