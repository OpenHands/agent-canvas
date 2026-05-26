import {
  Links,
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
import { isAgentServerUnavailableError } from "#/api/agent-server-compatibility";
import { TOAST_OPTIONS } from "#/utils/custom-toast-handlers";
import { TelemetryConsentBanner } from "#/components/features/analytics/telemetry-consent-banner";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useConfig } from "#/hooks/query/use-config";
import { AgentServerUIRoot } from "#/components/providers";
import {
  applyColorTheme,
  readPersistedColorTheme,
} from "#/themes/color-themes";
import {
  isAuthRequired,
  isAuthRequiredAndMissing,
  validateStoredSessionKey,
} from "#/api/agent-server-config";

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

// Shown in public mode when no API key has been configured yet.
const ApiKeyEntryScreen = React.lazy(() =>
  import("#/components/features/backends/api-key-entry-screen").then((m) => ({
    default: m.ApiKeyEntryScreen,
  })),
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

export const meta: MetaFunction = () => [
  { title: "OpenHands" },
  { name: "description", content: "Let's Start Building!" },
];

/**
 * When the launcher signals `authRequired` (public mode) and a session
 * key exists in localStorage, validate it against an authenticated
 * endpoint. Returns `"valid"` / `"invalid"` / `"pending"` / `"skip"`.
 * On 401 the stale key is automatically cleared from localStorage.
 */
function useValidateStoredKey(): "valid" | "invalid" | "pending" | "skip" {
  const shouldValidate = isAuthRequired() && !isAuthRequiredAndMissing();
  const [status, setStatus] = React.useState<
    "valid" | "invalid" | "pending" | "skip"
  >(shouldValidate ? "pending" : "skip");

  React.useEffect(() => {
    if (!shouldValidate) {
      setStatus("skip");
      return;
    }

    validateStoredSessionKey().then((valid) => {
      setStatus(valid ? "valid" : "invalid");
    });
  }, [shouldValidate]);

  return status;
}

export default function App() {
  const config = useConfig();
  const keyStatus = useValidateStoredKey();

  if (config.isPending || config.isLoading) {
    return <AgentServerBootstrapLoading />;
  }

  // Public mode auth gate: show the key-entry screen when the launcher
  // signalled authRequired and either (a) no key exists at all, or
  // (b) a stored key failed validation against the server (stale key
  // from a previous local-mode session).
  if (isAuthRequired()) {
    if (keyStatus === "pending") {
      return <AgentServerBootstrapLoading />;
    }

    if (isAuthRequiredAndMissing() || keyStatus === "invalid") {
      return (
        <React.Suspense fallback={<AgentServerBootstrapLoading />}>
          <ApiKeyEntryScreen />
        </React.Suspense>
      );
    }
  }

  if (isAgentServerUnavailableError(config.error)) {
    return <MissingAgentServerScreen />;
  }

  return <Outlet />;
}
