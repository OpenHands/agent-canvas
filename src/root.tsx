import {
  Links,
  Meta,
  MetaFunction,
  Navigate,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import "./tailwind.css";
import "./index.css";
import React from "react";
import { Toaster } from "react-hot-toast";
import { isAgentServerUnavailableError } from "#/api/agent-server-compatibility";
import { TOAST_OPTIONS } from "#/utils/custom-toast-handlers";
import { TelemetryConsentBanner } from "#/components/features/analytics/telemetry-consent-banner";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useConfig } from "#/hooks/query/use-config";
import { AgentServerUIRoot } from "#/components/providers";
import { AgentServerConnectionScreen } from "#/components/features/settings/agent-server-onboarding";
import {
  applyColorTheme,
  readPersistedColorTheme,
} from "#/themes/color-themes";

/** Applies the persisted color-theme palette to document.body on mount. */
function ColorThemeApplier() {
  React.useEffect(() => {
    applyColorTheme(readPersistedColorTheme());
  }, []);
  return null;
}

const AGENT_SERVER_SETTINGS_PATH = "/settings/backend";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body data-agent-server-ui="" className="m-0">
        <AgentServerUIRoot contentClassName="min-h-screen">
          <ColorThemeApplier />
          {children}
          <Toaster toastOptions={TOAST_OPTIONS} />
          <div id="modal-portal-exit" />
        </AgentServerUIRoot>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function AgentServerBootstrapLoading() {
  return (
    <main className="min-h-screen bg-base px-6 py-10 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="rounded-3xl border border-white/10 bg-base/80 px-8 py-10 shadow-2xl">
          <LoadingSpinner size="large" />
        </div>
      </div>
    </main>
  );
}

export const meta: MetaFunction = () => [
  { title: "OpenHands" },
  { name: "description", content: "Let's Start Building!" },
];

export default function App() {
  const location = useLocation();
  const config = useConfig();

  if (config.isPending || config.isLoading) {
    return <AgentServerBootstrapLoading />;
  }

  if (isAgentServerUnavailableError(config.error)) {
    if (location.pathname !== AGENT_SERVER_SETTINGS_PATH) {
      return <Navigate to={AGENT_SERVER_SETTINGS_PATH} replace />;
    }

    return <AgentServerConnectionScreen error={config.error} />;
  }

  return (
    <>
      <Outlet />
      {location.pathname !== AGENT_SERVER_SETTINGS_PATH ? (
        <TelemetryConsentBanner />
      ) : null}
    </>
  );
}
