import React from "react";
import { usePostHog } from "posthog-js/react";
import { handleCaptureConsent } from "#/utils/handle-capture-consent";
import { useSettings } from "./query/use-settings";
import { getTelemetryConsent, setTelemetryConsent } from "#/services/telemetry";

/**
 * Hook to sync PostHog opt-in/out state with the backend setting.
 *
 * Runs whenever settings change so that a consent decision made in one tab
 * or via the API is picked up without a page reload.
 * Also synchronizes backend settings to local storage to ensure consistency
 * during backend transitions or on new device visits.
 */
export const useSyncPostHogConsent = () => {
  const posthog = usePostHog();
  const { data: settings } = useSettings();

  React.useEffect(() => {
    if (!posthog || settings === undefined) return;

    const backendConsent = settings.user_consents_to_analytics;
    const localConsent = getTelemetryConsent();

    if (backendConsent === true || backendConsent === false) {
      // Sync backend to local storage if they differ
      const expectedLocal = backendConsent ? "granted" : "denied";
      if (localConsent !== expectedLocal) {
        void setTelemetryConsent(expectedLocal);
      }
      handleCaptureConsent(posthog, backendConsent);
    } else {
      // Backend is null (pending/not configured). Follow local storage choice.
      handleCaptureConsent(posthog, localConsent === "granted");
    }
  }, [posthog, settings]);
};
