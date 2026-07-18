import React from "react";
import { PostHogProvider } from "posthog-js/react";
import type { PostHog } from "posthog-js";
import {
  configurePostHogBootstrap,
  initializePostHogClient,
} from "#/services/telemetry";

const POSTHOG_BOOTSTRAP_KEY = "posthog_bootstrap";

function getBootstrapIds() {
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

export function PostHogWrapper({ children }: { children: React.ReactNode }) {
  const [posthogClient, setPosthogClient] = React.useState<PostHog | null>(
    null,
  );
  const bootstrapIds = React.useMemo(() => getBootstrapIds(), []);
  const bootstrapConfiguredRef = React.useRef(false);

  // Configure bootstrap synchronously so a child telemetry effect cannot win
  // the initialization race on the first render.
  if (!bootstrapConfiguredRef.current) {
    configurePostHogBootstrap(bootstrapIds);
    bootstrapConfiguredRef.current = true;
  }

  React.useEffect(() => {
    let cancelled = false;
    void initializePostHogClient()
      .then((client) => {
        if (!cancelled && client) {
          setPosthogClient(client);
        }
      })
      .catch(() => {
        // Analytics are optional; render children without a provider.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!posthogClient) {
    return children;
  }

  return <PostHogProvider client={posthogClient}>{children}</PostHogProvider>;
}
