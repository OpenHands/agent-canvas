import { useTranslation } from "react-i18next";
import { FaTriangleExclamation } from "react-icons/fa6";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import {
  LLM_CONFIGURATION_ISSUES,
  useLlmConfigured,
} from "#/hooks/use-llm-configured";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Typography } from "#/ui/typography";
import { buildLlmSettingsRoute } from "#/constants/llm-settings";

/**
 * Warns the user on the home screen when the active agent has no usable LLM —
 * most notably after they skip onboarding, which persists no settings. Offers
 * a single action that routes to LLM settings so the failure is communicated
 * up front instead of surfacing only when a conversation attempt errors out.
 *
 * Renders nothing while settings load (avoids a flash) or once the LLM is
 * configured; the settings query refetches after a key is saved, so the banner
 * unmounts on its own.
 */
export function LlmNotConfiguredBanner() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { isConfigured, isLoading, issue, activeProfileName } =
    useLlmConfigured();

  if (isLoading || isConfigured) {
    return null;
  }

  const isActiveProfileMissingApiKey =
    issue === LLM_CONFIGURATION_ISSUES.ACTIVE_PROFILE_MISSING_API_KEY;
  const messageKey = isActiveProfileMissingApiKey
    ? I18nKey.HOME$LLM_PROFILE_MISSING_API_KEY_MESSAGE
    : I18nKey.HOME$LLM_NOT_CONFIGURED_MESSAGE;
  const actionKey = isActiveProfileMissingApiKey
    ? I18nKey.HOME$LLM_PROFILE_MISSING_API_KEY_ACTION
    : I18nKey.HOME$LLM_NOT_CONFIGURED_ACTION;
  const route = buildLlmSettingsRoute(
    isActiveProfileMissingApiKey ? activeProfileName : null,
  );

  return (
    <div
      data-testid="home-llm-not-configured-banner"
      role="alert"
      className="bg-base border border-primary text-white p-4 rounded flex flex-row items-center justify-between gap-3 mt-3"
    >
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <FaTriangleExclamation className="text-primary align-middle" />
        </div>
        <Typography.Text className="ml-3 text-sm font-medium">
          {t(messageKey, { name: activeProfileName })}
        </Typography.Text>
      </div>

      <BrandButton
        testId="home-llm-not-configured-action"
        type="button"
        variant="primary"
        onClick={() => navigate(route)}
      >
        {t(actionKey)}
      </BrandButton>
    </div>
  );
}
