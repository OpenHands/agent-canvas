import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsClient } from "@openhands/typescript-client/clients";
import { I18nKey } from "#/i18n/declaration";
import { saveAgentServerConfig } from "#/api/agent-server-config";
import { isSdkHttpStatusError } from "#/api/agent-server-compatibility";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { cn } from "#/utils/utils";
import { BackendStatusDot } from "./backend-status-dot";

/**
 * Full-screen prompt shown when the server is in public mode
 * (`VITE_AUTH_REQUIRED=true`) and no valid API key has been configured.
 *
 * Renders the same card chrome as the "Add a Backend" modal
 * ({@link BackendFormModal} in add mode) but single-column — no cloud
 * OAuth, host pre-filled and read-only. On submit the key is validated
 * against `GET /api/settings` before persisting; wrong keys surface
 * an inline error instead of a blind reload.
 */
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
      // Use getAgentServerClientOptions so transport-level settings
      // (e.g. VITE_INSECURE_SKIP_VERIFY) are honoured.
      await new SettingsClient(
        getAgentServerClientOptions({
          host,
          sessionApiKey: trimmedKey,
          timeout: 5000,
        }),
      ).getSettings();

      setConnectionStatus("success");

      // Persist the validated key in both storage layers.
      // Preserve any existing custom name the user gave this backend;
      // fall back to hostname only for the initial entry.
      updateBackend(active.backend.id, {
        name: active.backend.name || window.location.hostname,
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
    } catch (err: unknown) {
      setConnectionStatus("error");

      // Distinguish auth errors (401) from everything else so a
      // correct key + broken server doesn't say "invalid key".
      if (isSdkHttpStatusError(err, 401)) {
        setErrorMessage(t(I18nKey.AUTH$INVALID_KEY));
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        setErrorMessage(
          `${t(I18nKey.AUTH$CONNECTION_FAILED)}${detail ? `: ${detail}` : ""}`,
        );
      }
      setIsValidating(false);
    }
  };

  return (
    <div
      data-testid="api-key-entry-screen"
      className="flex min-h-screen items-center justify-center bg-base px-6"
    >
      <div
        className={cn(
          "relative rounded-xl border border-[var(--oh-border)] bg-base-secondary",
          modalWidthClassName("md"),
          MODAL_MAX_WIDTH_VIEWPORT,
        )}
      >
        <div className="px-6 pt-6 pb-2 pr-12">
          <h2 className="text-lg font-semibold">
            {t(I18nKey.AUTH$API_KEY_REQUIRED_TITLE)}
          </h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">
            {t(I18nKey.AUTH$API_KEY_REQUIRED_DESCRIPTION)}
          </p>
        </div>

        <div className="px-6 pb-6 pt-2">
          <form
            data-testid="api-key-entry-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 flex-1 min-w-0"
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
                  isConnected={connectionStatus === "success"}
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
                : t(I18nKey.AUTH$CONNECT)}
            </BrandButton>
          </form>
        </div>
      </div>
    </div>
  );
}
