import React from "react";
import { setTelemetryConsent } from "#/services/telemetry";
import { useSaveSettings } from "./mutation/use-save-settings";

export const useMigrateUserConsent = () => {
  const { mutate: saveUserSettings } = useSaveSettings();

  const migrateUserConsent = React.useCallback(() => {
    const legacyConsent = localStorage.getItem("analytics-consent");
    if (legacyConsent === null) return;

    localStorage.removeItem("analytics-consent");
    const consent = legacyConsent === "true";
    void setTelemetryConsent(consent ? "granted" : "denied");
    saveUserSettings({ user_consents_to_analytics: consent });
  }, [saveUserSettings]);

  return { migrateUserConsent };
};
