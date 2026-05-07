import {
  Links,
  Meta,
  MetaFunction,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import "./tailwind.css";
import "./index.css";
import React from "react";
import { Toaster } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  AgentServerIncompatibilityError,
  AgentServerUnavailableError,
  isAgentServerIncompatibilityError,
  isAgentServerUnavailableError,
  MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
} from "#/api/agent-server-compatibility";
import { AgentServerConnectionForm } from "#/components/features/settings/agent-server-onboarding";
import { TelemetryConsentBanner } from "#/components/features/analytics/telemetry-consent-banner";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useConfig } from "#/hooks/query/use-config";
import { AgentServerUIRoot } from "#/components/providers";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body data-agent-server-ui="" style={{ margin: 0 }}>
        <AgentServerUIRoot contentClassName="min-h-screen">
          {children}
          <Toaster />
          <TelemetryConsentBanner />
          <div id="modal-portal-exit" />
        </AgentServerUIRoot>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function AgentServerStatusCard({
  title,
  message,
  details,
  version,
}: {
  title: string;
  message: string;
  details?: string | null;
  version?: string | null;
}) {
  const { t } = useTranslation("openhands");

  return (
    <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/10 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-200">{message}</p>
      {version ? (
        <p className="mt-3 text-xs leading-5 text-neutral-400">
          {t("SETTINGS$AGENT_SERVER_DETECTED_VERSION", { version })}
        </p>
      ) : null}
      {details ? (
        <p className="mt-3 text-xs leading-5 text-neutral-400">
          {t("SETTINGS$AGENT_SERVER_DETAILS_LABEL", { details })}
        </p>
      ) : null}
    </div>
  );
}

function AgentServerBootstrapLoading() {
  return (
    <main className="min-h-screen bg-base px-6 py-10 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="rounded-3xl border border-white/10 bg-neutral-900/80 px-8 py-10 shadow-2xl">
          <LoadingSpinner size="large" />
        </div>
      </div>
    </main>
  );
}

function AgentServerOnboardingLayout({
  testId,
  eyebrow,
  title,
  description,
  statusTitle,
  statusMessage,
  statusDetails,
  version,
}: {
  testId: string;
  eyebrow: string;
  title: string;
  description: string;
  statusTitle: string;
  statusMessage: string;
  statusDetails?: string | null;
  version?: string | null;
}) {
  const { t } = useTranslation("openhands");

  return (
    <main className="min-h-screen bg-base px-6 py-10 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center">
        <div
          data-testid={testId}
          className="grid w-full gap-8 lg:grid-cols-[1.15fr,0.85fr]"
        >
          <section className="rounded-3xl border border-white/10 bg-neutral-900/80 p-8 shadow-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-white">
              {title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-200">
              {description}
            </p>

            <AgentServerStatusCard
              title={statusTitle}
              message={statusMessage}
              details={statusDetails}
              version={version}
            />

            <p className="mt-6 max-w-3xl text-sm leading-6 text-gray-400">
              {t("SETTINGS$AGENT_SERVER_SETUP_GUIDE_HINT")}{" "}
              <a
                href="https://github.com/OpenHands/agent-canvas"
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 transition-colors hover:text-white"
              >
                {t("SETTINGS$AGENT_SERVER_SETUP_GUIDE_LINK")}
              </a>
              .
            </p>
          </section>

          <aside className="lg:pt-6">
            <AgentServerConnectionForm />
          </aside>
        </div>
      </div>
    </main>
  );
}

function UnsupportedAgentServerNotice({
  error,
}: {
  error: AgentServerIncompatibilityError;
}) {
  const { t } = useTranslation("openhands");

  return (
    <AgentServerOnboardingLayout
      testId="agent-server-upgrade-screen"
      eyebrow={t("SETTINGS$AGENT_SERVER_UPGRADE_EYEBROW")}
      title={t("SETTINGS$AGENT_SERVER_UPGRADE_TITLE")}
      description={t("SETTINGS$AGENT_SERVER_UPGRADE_DESCRIPTION", {
        minimumVersion: MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
      })}
      statusTitle={t("SETTINGS$AGENT_SERVER_UPGRADE_STATUS_TITLE")}
      statusMessage={t("SETTINGS$AGENT_SERVER_UPGRADE_STATUS_MESSAGE", {
        minimumVersion: MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
      })}
      version={error.serverVersion}
    />
  );
}

function UnknownAgentServerNotice() {
  const { t } = useTranslation("openhands");

  return (
    <AgentServerOnboardingLayout
      testId="agent-server-onboarding-screen"
      eyebrow={t("SETTINGS$AGENT_SERVER_ONBOARDING_EYEBROW")}
      title={t("SETTINGS$AGENT_SERVER_ONBOARDING_TITLE")}
      description={t("SETTINGS$AGENT_SERVER_ONBOARDING_DESCRIPTION", {
        minimumVersion: MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
      })}
      statusTitle={t("SETTINGS$AGENT_SERVER_UNKNOWN_VERSION_STATUS_TITLE")}
      statusMessage={t("SETTINGS$AGENT_SERVER_UNKNOWN_VERSION_STATUS_MESSAGE", {
        minimumVersion: MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
      })}
    />
  );
}

function MissingAgentServerNotice({
  error,
}: {
  error: AgentServerUnavailableError;
}) {
  const { t } = useTranslation("openhands");

  return (
    <AgentServerOnboardingLayout
      testId="agent-server-onboarding-screen"
      eyebrow={t("SETTINGS$AGENT_SERVER_ONBOARDING_EYEBROW")}
      title={t("SETTINGS$AGENT_SERVER_ONBOARDING_TITLE")}
      description={t("SETTINGS$AGENT_SERVER_ONBOARDING_DESCRIPTION", {
        minimumVersion: MINIMUM_SUPPORTED_AGENT_SERVER_VERSION,
      })}
      statusTitle={t("SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_TITLE")}
      statusMessage={t("SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_MESSAGE")}
      statusDetails={error.details}
    />
  );
}

export const meta: MetaFunction = () => [
  { title: "OpenHands" },
  { name: "description", content: "Let's Start Building!" },
];

export default function App() {
  const location = useLocation();
  const config = useConfig();
  const isAgentServerSettingsRoute =
    location.pathname === "/settings/agent-server";

  if (!isAgentServerSettingsRoute && (config.isPending || config.isLoading)) {
    return <AgentServerBootstrapLoading />;
  }

  if (
    !isAgentServerSettingsRoute &&
    isAgentServerUnavailableError(config.error)
  ) {
    return <MissingAgentServerNotice error={config.error} />;
  }

  if (
    !isAgentServerSettingsRoute &&
    isAgentServerIncompatibilityError(config.error)
  ) {
    if (!config.error.serverVersion) {
      return <UnknownAgentServerNotice />;
    }

    return <UnsupportedAgentServerNotice error={config.error} />;
  }

  return <Outlet />;
}
