import { useMutation } from "@tanstack/react-query";
import { usePostHog } from "posthog-js/react";
import { useNavigate } from "react-router";
import { SessionClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { handleCaptureConsent } from "#/utils/handle-capture-consent";
import { useTracking } from "#/hooks/use-tracking";

interface AcceptTosVariables {
  redirectUrl: string;
}

export const useAcceptTos = () => {
  const posthog = usePostHog();
  const navigate = useNavigate();
  const { trackUserSignupCompleted } = useTracking();

  return useMutation({
    mutationFn: async ({ redirectUrl }: AcceptTosVariables) => {
      // Set consent for analytics
      handleCaptureConsent(posthog, true);

      // Call the API to record TOS acceptance in the database
      return new SessionClient(getAgentServerClientOptions()).acceptTos(
        redirectUrl,
      );
    },
    onSuccess: (response, { redirectUrl }) => {
      // Track user signup completion
      trackUserSignupCompleted();

      // Get the redirect URL from the response
      const finalRedirectUrl = response.redirect_url || redirectUrl;

      // Check if the redirect URL is an external URL (starts with http or https)
      if (
        finalRedirectUrl.startsWith("http://") ||
        finalRedirectUrl.startsWith("https://")
      ) {
        // For external URLs, redirect using window.location
        window.location.href = finalRedirectUrl;
      } else {
        // For internal routes, use navigate
        navigate(finalRedirectUrl);
      }
    },
    onError: () => {
      window.location.href = "/";
    },
  });
};
