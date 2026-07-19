import React from "react";
import { PostHogProvider } from "posthog-js/react";
import type { PostHog } from "posthog-js";
import {
  configurePostHogBootstrap,
  configureTelemetry,
  initializePostHogClient,
  trackEvent,
  trackException,
  type TelemetryConfiguration,
} from "#/services/telemetry";

const POSTHOG_BOOTSTRAP_KEY = "posthog_bootstrap";
const noop = () => undefined;
const INERT_POSTHOG_CLIENT = Object.freeze({
  capture: noop,
  captureException: noop,
  identify: noop,
  reset: noop,
}) as unknown as PostHog;
const DEFERRED_POSTHOG_CLIENT = Object.freeze({
  capture: (event: string, properties?: Record<string, unknown>) => {
    void trackEvent(event, properties);
  },
  captureException: (error: unknown, properties?: Record<string, unknown>) => {
    void trackException(error, properties);
  },
  identify: noop,
  reset: noop,
}) as unknown as PostHog;

function getBootstrapIds() {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
    return undefined;
  }

  // Try to extract from URL hash (e.g. #distinct_id=abc&session_id=xyz)
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const distinctId = params.get("distinct_id");
  const sessionId = params.get("session_id");

  if (distinctId && sessionId) {
    const bootstrap = { distinctID: distinctId, sessionID: sessionId };

    // Persist to sessionStorage so IDs survive full-page OAuth redirects
    sessionStorage.setItem(POSTHOG_BOOTSTRAP_KEY, JSON.stringify(bootstrap));

    // Clean the hash from the URL
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    return bootstrap;
  }

  // Fallback: check sessionStorage (covers return from OAuth redirect)
  const stored = sessionStorage.getItem(POSTHOG_BOOTSTRAP_KEY);
  if (stored) {
    sessionStorage.removeItem(POSTHOG_BOOTSTRAP_KEY);
    return JSON.parse(stored) as { distinctID: string; sessionID: string };
  }

  return undefined;
}

export function PostHogWrapper({
  children,
  config = {},
}: {
  children: React.ReactNode;
  config?: TelemetryConfiguration;
}) {
  const [posthogClient, setPosthogClient] = React.useState<PostHog>(
    DEFERRED_POSTHOG_CLIENT,
  );
  const bootstrapIds = React.useMemo(() => getBootstrapIds(), []);
  const analyticsEnabled = config !== false;
  const apiKey = config === false ? undefined : config.apiKey;
  const apiHost = config === false ? undefined : config.apiHost;
  const uiHost = config === false ? undefined : config.uiHost;

  React.useLayoutEffect(() => {
    configureTelemetry(analyticsEnabled ? { apiKey, apiHost, uiHost } : false);
    configurePostHogBootstrap(bootstrapIds);
  }, [analyticsEnabled, apiHost, apiKey, bootstrapIds, uiHost]);

  React.useEffect(() => {
    if (!analyticsEnabled) return undefined;

    let cancelled = false;
    void initializePostHogClient()
      .then((client) => {
        if (!cancelled && client) {
          setPosthogClient(client);
        }
      })
      .catch(() => {
        // Analytics are optional; keep the deferred provider so a later
        // capture can retry initialization.
      });
    return () => {
      cancelled = true;
    };
  }, [analyticsEnabled, apiHost, apiKey, uiHost]);

  return (
    <PostHogProvider
      client={analyticsEnabled ? posthogClient : INERT_POSTHOG_CLIENT}
    >
      {children}
    </PostHogProvider>
  );
}
