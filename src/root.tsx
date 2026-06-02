import {
  Links,
  LinksFunction,
  Meta,
  MetaFunction,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import "./tailwind.css";
import "./index.css";
import React from "react";
import { Toaster } from "react-hot-toast";
import {
  isAgentServerUnavailableError,
  isAgentServerAuthError,
} from "#/api/agent-server-compatibility";
import { isAuthRequiredAndMissing } from "#/api/agent-server-config";
import { TOAST_OPTIONS } from "#/utils/custom-toast-handlers";
import { TelemetryConsentBanner } from "#/components/features/analytics/telemetry-consent-banner";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useConfig } from "#/hooks/query/use-config";
import { AgentServerUIRoot } from "#/components/providers";
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

// Only rendered when the active backend is unreachable; keep the modal out of
// the default root graph.
const ManageBackendsModal = React.lazy(() =>
  import("#/components/features/backends/manage-backends-modal").then((m) => ({
    default: m.ManageBackendsModal,
  })),
);

// Rendered when the backend returns 401 (public mode — user must paste key).
const ApiKeyEntryScreen = React.lazy(
  () => import("#/components/features/backends/api-key-entry-screen"),
);

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
          <TelemetryConsentBanner />
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

/**
 * When the active backend is unreachable, the rest of the app cannot
 * render (most queries chain off of `/server_info`). Drop a minimal
 * placeholder behind the Manage Backends modal so the user can edit,
 * add, or pick another backend right away.
 */
function MissingAgentServerScreen() {
  const noop = React.useCallback(() => {}, []);

  return (
    <main
      data-testid="agent-server-onboarding-screen"
      className="min-h-screen bg-base"
    >
      <React.Suspense fallback={null}>
        <ManageBackendsModal onClose={noop} />
      </React.Suspense>
    </main>
  );
}

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
];

export const meta: MetaFunction = () => [
  { title: "OpenHands" },
  { name: "description", content: "Let's Start Building!" },
];

export default function App() {
  // Flag-based gate: in public mode (VITE_AUTH_REQUIRED=true) with no
  // session key yet, show the auth screen immediately — no network
  // round-trip needed.
  const authMissing = isAuthRequiredAndMissing();

  // Skip the /server_info probe entirely when we already know auth is
  // required and missing — it would just 401 and waste time.
  const config = useConfig({ enabled: !authMissing });

  // No key at all → instant auth screen (no network).
  // Stale key → /server_info 401 → auth screen (public mode only).
  if (authMissing || isAgentServerAuthError(config.error)) {
    return (
      <React.Suspense fallback={<AgentServerBootstrapLoading />}>
        <ApiKeyEntryScreen />
      </React.Suspense>
    );
  }

  if (config.isPending || config.isLoading) {
    return <AgentServerBootstrapLoading />;
  }

  if (isAgentServerUnavailableError(config.error)) {
    return <MissingAgentServerScreen />;
  }

  return <Outlet />;
}
