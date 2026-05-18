import type { PostHog } from "posthog-js";

interface ErrorDetails {
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
  msgId?: string;
  posthog?: PostHog;
}

export function trackError({
  message,
  source,
  metadata = {},
  posthog,
}: ErrorDetails) {
  if (!posthog) return;

  const error = new Error(message);
  posthog.captureException(error, {
    error_source: source || "unknown",
    ...metadata,
  });
}
