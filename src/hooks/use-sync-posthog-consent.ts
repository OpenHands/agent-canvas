import React from "react";
import { setTelemetryConsent } from "#/services/telemetry";
import { useSettings } from "./query/use-settings";

/**
 * Hook to sync PostHog opt-in/out state with the backend setting.
 *
 * Runs whenever settings change so that a consent decision made in one tab
 * or via the API is picked up without a page reload.
 *
 * Consent model:
 *   true  → opt in  (user explicitly accepted)
 *   false → opt out (user explicitly denied)
 *   null  → opt out (consent not yet collected — safe default while loading
 *           or on first visit, prevents capturing before the user has decided)
 */
export const useSyncPostHogConsent = () => {
  const { data: settings } = useSettings();

  React.useEffect(() => {
    if (settings === undefined) return;

    // null and false are both treated as "not consented".
    // Only an explicit true opts PostHog in.
    void setTelemetryConsent(
      settings.user_consents_to_analytics === true ? "granted" : "denied",
    );
  }, [settings]);
};
