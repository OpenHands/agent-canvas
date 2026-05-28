import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsClient } from "@openhands/typescript-client/clients";
import { I18nKey } from "#/i18n/declaration";
import { saveAgentServerConfig } from "#/api/agent-server-config";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BackendStatusDot } from "./backend-status-dot";

/**
 * Full-screen prompt shown when the server is in public mode
 * (`VITE_AUTH_REQUIRED=true`) and no valid API key has been configured.
 *
 * Mirrors the left column of the "Add a Backend" modal
 * ({@link ManualConnectionColumn}) but with the host pre-filled /
 * read-only and no cloud OAuth option. On submit the key is validated
 * against `GET /api/settings` before persisting — wrong keys surface
 * an inline error instead of a blind reload.
 */
// eslint-disable-next-line import/no-default-export -- React.lazy requires a default export
export default function ApiKeyEntryScreen() {
  const { t } = useTranslation("openhands");
  const { active, updateBackend } = useActiveBackendContext();

  const host = window.location.origin;
  // Always start with an empty key so stale credentials don't bleed
  // through from a previous session / server restart.
  const [apiKey, setApiKey] = React.useState("");
  const [isValidating, setIsValidating] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<
    "idle" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const canSubmit = apiKey.trim().length > 0 && !isValidating;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsValidating(true);
    setConnectionStatus("idle");
    setErrorMessage(null);

    const trimmedKey = apiKey.trim();

    try {
      // Validate against a protected endpoint before persisting.
      await new SettingsClient({
        host,
        apiKey: trimmedKey,
        timeout: 5000,
      }).getSettings();

      setConnectionStatus("success");

      // Persist the validated key in both storage layers.
      updateBackend(active.backend.id, {
        name: active.backend.name,
        host,
        apiKey: trimmedKey,
        kind: "local",
      });
      saveAgentServerConfig({
        baseUrl: host,
        sessionApiKey: trimmedKey,
      });

      // Hard reload so every service layer re-reads the key.
      window.location.reload();
    } catch {
      setConnectionStatus("error");
      setErrorMessage(t(I18nKey.AUTH$INVALID_KEY));
      setIsValidating(false);
    }
  };

  return (
    <main
      data-testid="api-key-entry-screen"
      className="flex min-h-screen items-center justify-center bg-base px-6"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--oh-border)] bg-base-secondary p-8 shadow-2xl">
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-2xl font-bold text-white">
            {t(I18nKey.AUTH$API_KEY_REQUIRED_TITLE)}
          </h1>
          <p className="text-sm text-[var(--oh-muted)]">
            {t(I18nKey.AUTH$API_KEY_REQUIRED_DESCRIPTION)}
          </p>
        </div>

        <form
          data-testid="api-key-entry-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <SettingsInput
              testId="api-key-entry-host"
              name="api-key-entry-host"
              type="text"
              label={t(I18nKey.BACKEND$HOST_LABEL)}
              value={host}
              className="w-full"
              isDisabled
            />
            <p className="text-xs text-[var(--oh-muted)]">
              {t(I18nKey.BACKEND$HOST_HELPER)}
            </p>
          </div>

          <SettingsInput
            testId="api-key-entry-api-key"
            name="api-key-entry-api-key"
            type="password"
            label={t(I18nKey.BACKEND$KEY_LABEL)}
            value={apiKey}
            onChange={setApiKey}
            placeholder="sk-••••••••••"
            className="w-full"
          />

          {/* Connection status indicator */}
          {connectionStatus !== "idle" && (
            <div className="flex items-center gap-3 text-sm">
              <BackendStatusDot
                isConnected={connectionStatus === "success" ? true : false}
              />
              <span
                data-testid="api-key-entry-status"
                className={
                  connectionStatus === "error"
                    ? "text-red-400"
                    : "text-green-400"
                }
              >
                {connectionStatus === "error"
                  ? errorMessage
                  : t(I18nKey.ONBOARDING$BACKEND_STATUS_CONNECTED)}
              </span>
            </div>
          )}

          <BrandButton
            type="submit"
            variant="secondary"
            isDisabled={!canSubmit}
            testId="api-key-entry-submit"
            className="w-full text-center"
          >
            {isValidating
              ? t(I18nKey.ONBOARDING$BACKEND_STATUS_CHECKING)
              : t(I18nKey.BACKEND$CONNECT)}
          </BrandButton>
        </form>
      </div>
    </main>
  );
}
