import { usePostHog } from "posthog-js/react";
import { useSettings } from "./query/use-settings";
import { Provider } from "#/types/settings";

/**
 * Hook that provides tracking functions with automatic data collection
 * from available hooks (settings, etc.)
 */
export const useTracking = () => {
  const posthog = usePostHog();
  const { data: settings } = useSettings();

  // Common properties included in all tracking events
  const commonProperties = {
    current_url: window.location.href,
    user_email: settings?.email || settings?.git_user_email || null,
  };

  const trackLoginButtonClick = ({ provider }: { provider: Provider }) => {
    posthog.capture("login_button_clicked", {
      provider,
      ...commonProperties,
    });
  };

  const trackConversationCreated = ({
    hasRepository,
  }: {
    hasRepository: boolean;
  }) => {
    posthog.capture("conversation_created", {
      has_repository: hasRepository,
      ...commonProperties,
    });
  };

  const trackPushButtonClick = () => {
    posthog.capture("push_button_clicked", {
      ...commonProperties,
    });
  };

  const trackPullButtonClick = () => {
    posthog.capture("pull_button_clicked", {
      ...commonProperties,
    });
  };

  const trackCreatePrButtonClick = () => {
    posthog.capture("create_pr_button_clicked", {
      ...commonProperties,
    });
  };

  const trackUserSignupCompleted = () => {
    posthog.capture("user_signup_completed", {
      signup_timestamp: new Date().toISOString(),
      ...commonProperties,
    });
  };

  return {
    trackLoginButtonClick,
    trackConversationCreated,
    trackPushButtonClick,
    trackPullButtonClick,
    trackCreatePrButtonClick,
    trackUserSignupCompleted,
  };
};
