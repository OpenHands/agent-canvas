import React from "react";
import { setTelemetryConsent } from "#/services/telemetry";
import { useSaveSettings } from "./mutation/use-save-settings";

export const useMigrateUserConsent = () => {
  const { mutate: saveUserSettings } = useSaveSettings();

  /**
   * Migrate user consent to the settings store on the server.
   */
  const migrateUserConsent = React.useCallback(
    async (args?: { handleAnalyticsWasPresentInLocalStorage: () => void }) => {
      const userAnalyticsConsent = localStorage.getItem("analytics-consent");

      if (userAnalyticsConsent) {
        args?.handleAnalyticsWasPresentInLocalStorage();

        saveUserSettings(
          { user_consents_to_analytics: userAnalyticsConsent === "true" },
          {
            onSuccess: () => {
              void setTelemetryConsent(
                userAnalyticsConsent === "true" ? "granted" : "denied",
              );
            },
          },
        );

        localStorage.removeItem("analytics-consent");
      }
    },
    [saveUserSettings],
  );

  return { migrateUserConsent };
};
