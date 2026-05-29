import React from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentServerUnavailableError } from "#/api/agent-server-compatibility";
import { getAgentServerFormDefaults } from "#/api/agent-server-config";
import { I18nKey } from "#/i18n/declaration";
import { ManageBackendsPanel } from "#/components/features/backends/manage-backends-modal";
import { useActiveBackendContext } from "#/contexts/active-backend-context";

interface AgentServerConnectionScreenProps {
  error?: AgentServerUnavailableError | null;
}

function getStatusKeys(
  error: AgentServerUnavailableError | null | undefined,
  hasRegisteredBackends: boolean,
) {
  if (!error) return null;

  if (error?.reason === "unauthorized") {
    return {
      title: I18nKey.SETTINGS$AGENT_SERVER_AUTH_STATUS_TITLE,
      message: I18nKey.SETTINGS$AGENT_SERVER_AUTH_STATUS_MESSAGE,
      showDetails: true,
    };
  }

  const configuredBaseUrl = getAgentServerFormDefaults().baseUrl.trim();

  if (!configuredBaseUrl && !hasRegisteredBackends) {
    return {
      title: I18nKey.SETTINGS$AGENT_SERVER_MISSING_STATUS_TITLE,
      message: I18nKey.SETTINGS$AGENT_SERVER_MISSING_STATUS_MESSAGE,
      showDetails: false,
    };
  }

  return {
    title: I18nKey.SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_TITLE,
    message: I18nKey.SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_MESSAGE,
    showDetails: true,
  };
}

export function AgentServerConnectionScreen({
  error,
}: AgentServerConnectionScreenProps) {
  const { t } = useTranslation("openhands");
  const { backends } = useActiveBackendContext();
  const status = getStatusKeys(error, backends.length > 0);
  const retryConnection = React.useCallback(() => {
    window.location.assign("/");
  }, []);

  return (
    <main
      data-testid="agent-server-onboarding-screen"
      className="min-h-screen bg-base px-4 py-8 text-white sm:px-6"
    >
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col justify-center gap-4">
        <section className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
              {t(I18nKey.SETTINGS$AGENT_SERVER_ONBOARDING_EYEBROW)}
            </p>
            <h1 className="mt-3 text-2xl font-semibold leading-tight">
              {t(I18nKey.SETTINGS$AGENT_SERVER_ONBOARDING_TITLE)}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--oh-muted)]">
              {t(I18nKey.SETTINGS$AGENT_SERVER_ONBOARDING_DESCRIPTION)}
            </p>
          </div>

          {status ? (
            <div
              role="alert"
              data-testid="agent-server-connection-status"
              className="flex gap-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 text-sm"
            >
              <AlertTriangle
                aria-hidden
                className="mt-0.5 size-5 shrink-0 text-[var(--oh-muted)]"
                strokeWidth={2}
              />
              <div className="min-w-0">
                <p className="font-medium text-white">{t(status.title)}</p>
                <p className="mt-1 leading-6 text-[var(--oh-muted)]">
                  {t(status.message)}
                </p>
                {status.showDetails && error?.details ? (
                  <p className="mt-2 break-words text-xs leading-5 text-[var(--oh-text-subtle)]">
                    {t(I18nKey.SETTINGS$AGENT_SERVER_DETAILS_LABEL, {
                      details: error.details,
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <ManageBackendsPanel
          onDone={retryConnection}
          doneLabel={I18nKey.SETTINGS$AGENT_SERVER_RETRY_CONNECTION}
          doneTestId="retry-connection-button"
        />
      </div>
    </main>
  );
}
