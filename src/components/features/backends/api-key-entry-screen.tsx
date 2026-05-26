import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { saveAgentServerConfig } from "#/api/agent-server-config";

/**
 * Full-screen prompt shown when the server is in public mode and no
 * API key has been configured yet (neither in localStorage nor via
 * `/backends.json`). The user pastes the `LOCAL_BACKEND_API_KEY` that
 * was set when the server was started with `--public`.
 *
 * On submit the key is persisted to localStorage (via
 * {@link saveAgentServerConfig}) and the page is reloaded so every
 * downstream consumer (backend registry, query clients, WebSocket)
 * picks up the new credential.
 */
export function ApiKeyEntryScreen() {
  const { t } = useTranslation("openhands");
  const [apiKey, setApiKey] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = apiKey.trim();
    if (!trimmed) return;

    // Persist the key in the same localStorage slot the backend-form /
    // settings page uses, so the normal config resolution picks it up.
    saveAgentServerConfig({
      baseUrl: window.location.origin,
      sessionApiKey: trimmed,
    });

    // Hard reload so every service layer re-reads the key.
    window.location.reload();
  };

  return (
    <main
      data-testid="api-key-entry-screen"
      className="flex min-h-screen items-center justify-center bg-base px-6"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-base/80 p-8 shadow-2xl"
      >
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold text-white">
            {t(I18nKey.AUTH$API_KEY_REQUIRED_TITLE)}
          </h1>
          <p className="text-sm text-neutral-400">
            {t(I18nKey.AUTH$API_KEY_REQUIRED_DESCRIPTION)}
          </p>
        </div>

        <input
          data-testid="api-key-input"
          type="password"
          autoComplete="off"
          ref={(el) => el?.focus()}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t(I18nKey.AUTH$API_KEY_PLACEHOLDER)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-neutral-500 outline-none focus:border-white/30"
        />

        <button
          data-testid="api-key-submit"
          type="submit"
          disabled={!apiKey.trim()}
          className="w-full rounded-lg bg-white px-4 py-3 font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t(I18nKey.AUTH$CONNECT)}
        </button>
      </form>
    </main>
  );
}
