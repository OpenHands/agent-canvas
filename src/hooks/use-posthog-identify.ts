import React from "react";
import { usePostHog } from "posthog-js/react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useCloudCurrentUserId } from "#/hooks/query/use-cloud-current-user-id";
import { useSettings } from "#/hooks/query/use-settings";

/**
 * Calls posthog.identify() for cloud users who have granted analytics consent.
 *
 * Cloud mode only — local mode has no stable server-issued user ID and
 * person_profiles="identified_only" would silently drop all events anyway.
 *
 * Identity lifecycle:
 *  - consent === true  + userId present → posthog.identify(userId, { email })
 *  - consent === false (explicit denial) → posthog.reset()
 *  - userId becomes null after identify  → posthog.reset() (logout)
 *  - consent === null / settings loading → no-op (wait for decision)
 */
export const usePostHogIdentify = () => {
  const posthog = usePostHog();
  const { backend } = useActiveBackend();
  const { data: settings } = useSettings();
  const userIds = useCloudCurrentUserId();
  const hasIdentifiedRef = React.useRef(false);

  const isCloud = backend.kind === "cloud";
  const userId = isCloud ? (userIds[backend.id]?.userId ?? null) : null;
  const consent = settings?.user_consents_to_analytics;

  React.useEffect(() => {
    if (!posthog || !isCloud || settings === undefined) return;

    if (consent === true && userId) {
      posthog.identify(userId, { email: settings.email ?? undefined });
      hasIdentifiedRef.current = true;
      return;
    }

    // Reset on explicit denial or on logout (userId gone after a prior identify)
    if (consent === false || (hasIdentifiedRef.current && !userId)) {
      posthog.reset();
      hasIdentifiedRef.current = false;
    }
  }, [posthog, isCloud, consent, userId, settings?.email, settings]);
};
