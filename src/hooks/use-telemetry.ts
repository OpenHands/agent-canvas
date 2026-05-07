import { useEffect, useState, useCallback } from "react";
import {
  getTelemetryConsent,
  setTelemetryConsent,
  trackFirstUse,
  trackSessionStart,
  trackEvent,
  clearTelemetryData,
  type TelemetryConsent,
} from "#/services/telemetry";

export interface UseTelemetryReturn {
  /** Current consent status */
  consent: TelemetryConsent;
  /** Whether telemetry is enabled (consent granted) */
  isEnabled: boolean;
  /** Whether consent prompt should be shown */
  showConsentPrompt: boolean;
  /** Grant consent and enable telemetry */
  grantConsent: () => void;
  /** Deny consent and disable telemetry */
  denyConsent: () => void;
  /** Track a custom event (only if consent granted) */
  track: (eventName: string, properties?: Record<string, unknown>) => void;
  /** Clear all telemetry data */
  clearData: () => void;
}

/**
 * Hook for managing telemetry consent and tracking.
 *
 * This hook handles:
 * - Checking and setting user consent
 * - Tracking first use automatically when consent is granted
 * - Providing a simple API for tracking custom events
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { consent, showConsentPrompt, grantConsent, denyConsent, track } = useTelemetry();
 *
 *   useEffect(() => {
 *     track('component_mounted', { component: 'MyComponent' });
 *   }, [track]);
 *
 *   if (showConsentPrompt) {
 *     return <ConsentBanner onAccept={grantConsent} onDecline={denyConsent} />;
 *   }
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useTelemetry(): UseTelemetryReturn {
  const [consent, setConsentState] = useState<TelemetryConsent>(() =>
    getTelemetryConsent(),
  );
  const [hasTrackedFirstUse, setHasTrackedFirstUse] = useState(false);

  // Track first use when consent is granted
  useEffect(() => {
    if (consent === "granted" && !hasTrackedFirstUse) {
      setHasTrackedFirstUse(true);
      trackFirstUse();
      trackSessionStart();
    }
  }, [consent, hasTrackedFirstUse]);

  const grantConsent = useCallback(() => {
    setTelemetryConsent("granted");
    setConsentState("granted");
  }, []);

  const denyConsent = useCallback(() => {
    setTelemetryConsent("denied");
    setConsentState("denied");
  }, []);

  const track = useCallback(
    (eventName: string, properties?: Record<string, unknown>) => {
      if (consent === "granted") {
        trackEvent(eventName, properties);
      }
    },
    [consent],
  );

  const clearData = useCallback(() => {
    clearTelemetryData();
    setConsentState("pending");
  }, []);

  return {
    consent,
    isEnabled: consent === "granted",
    showConsentPrompt: consent === "pending",
    grantConsent,
    denyConsent,
    track,
    clearData,
  };
}
