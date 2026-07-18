import React from "react";
import { usePostHog } from "posthog-js/react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useCloudCurrentUserId } from "#/hooks/query/use-cloud-current-user-id";
import { useSettings } from "#/hooks/query/use-settings";
import {
  getTelemetryConsent,
  subscribeTelemetryConsent,
  type TelemetryConsent,
} from "#/services/telemetry";

/**
 * Calls posthog.identify() for cloud users who have granted analytics consent.
 *
 * Cloud mode only — local mode has no stable server-issued user ID and
 * person_profiles="identified_only" would silently drop all events anyway.
 *
 * Identity lifecycle:
 *  - consent granted + userId present → identify(userId, { email })
 *  - consent denied → posthog.reset()
 *  - userId becomes null after identify  → posthog.reset() (logout)
 *  - consent pending → no-op (wait for decision)
 */
export const usePostHogIdentify = () => {
  const posthog = usePostHog();
  const { backend } = useActiveBackend();
  const { data: settings } = useSettings();
  const userIds = useCloudCurrentUserId();
  const consent = React.useSyncExternalStore<TelemetryConsent>(
    subscribeTelemetryConsent,
    getTelemetryConsent,
    () => "pending",
  );
  const hasIdentifiedRef = React.useRef(false);

  const isCloud = backend.kind === "cloud";
  const userId = isCloud ? (userIds[backend.id]?.userId ?? null) : null;

  React.useEffect(() => {
    if (!posthog || !isCloud || consent === "pending") return;

    if (consent === "granted" && userId) {
      posthog.identify(userId, {
        email: settings?.email ?? settings?.git_user_email ?? undefined,
      });
      hasIdentifiedRef.current = true;
      return;
    }

    // Reset on explicit denial or on logout (userId gone after a prior identify)
    if (consent === "denied" || (hasIdentifiedRef.current && !userId)) {
      posthog.reset();
      hasIdentifiedRef.current = false;
    }
  }, [
    posthog,
    isCloud,
    consent,
    userId,
    settings?.email,
    settings?.git_user_email,
  ]);
};
