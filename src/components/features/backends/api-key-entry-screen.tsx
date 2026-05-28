import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { saveAgentServerConfig } from "#/api/agent-server-config";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  BackendForm,
  type BackendFormSubmitPayload,
} from "./backend-form-modal";

/**
 * Full-screen prompt shown when the server is in public mode and no
 * API key has been configured yet (neither in localStorage nor via
 * `/backends.json`). The user pastes the `LOCAL_BACKEND_API_KEY` that
 * was set when the server was started with `--public`.
 *
 * Reuses the standard {@link BackendForm} with the host pre-filled
 * from the current origin and the name field hidden, so the user only
 * needs to paste an API key. On submit the key is persisted to
 * localStorage (via {@link saveAgentServerConfig}) and the page is
 * reloaded so every downstream consumer picks up the new credential.
 */
// eslint-disable-next-line import/no-default-export -- React.lazy requires a default export
export default function ApiKeyEntryScreen() {
  const { t } = useTranslation("openhands");
  const { active } = useActiveBackendContext();

  // Build a backend object with the current origin as host so the
  // form's host field is pre-filled and read-only.
  const backend = React.useMemo(
    () => ({ ...active.backend, host: window.location.origin }),
    [active.backend],
  );

  const handlePayload = React.useCallback(
    (payload: BackendFormSubmitPayload) => {
      // Persist the key in the agent-server-config localStorage slot
      // so the auth gate (`isAuthRequiredAndMissing`) clears on reload.
      saveAgentServerConfig({
        baseUrl: payload.host,
        sessionApiKey: payload.apiKey,
      });

      // Hard reload so every service layer re-reads the key.
      window.location.reload();
    },
    [],
  );

  // noop — the reload in handlePayload takes over before this fires.
  const noop = React.useCallback(() => {}, []);

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

        <BackendForm
          mode="edit"
          backend={backend}
          onSubmitted={noop}
          onSubmitPayload={handlePayload}
          hideName
          hostReadOnly
          testIdRoot="api-key-entry"
          renderActions={({ canSubmit, testIdRoot }) => (
            <BrandButton
              type="submit"
              variant="primary"
              isDisabled={!canSubmit}
              testId={`${testIdRoot}-submit`}
              className="w-full mt-2"
            >
              {t(I18nKey.AUTH$CONNECT)}
            </BrandButton>
          )}
        />
      </div>
    </main>
  );
}
