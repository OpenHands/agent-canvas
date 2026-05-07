import { useEffect, useState, useCallback, useRef } from "react";
import {
  getTelemetryConsent,
  setTelemetryConsent,
  trackInstall,
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
 * TRACKING BEHAVIOR:
 * - Install event: Sent immediately on first mount, regardless of consent status.
 *   This is anonymous and allows us to track library adoption.
 * - Session/custom events: Only sent after user grants consent.
 *
 * This hook handles:
 * - Sending install event immediately on first use
 * - Showing consent prompt for ongoing tracking
 * - Tracking session start when consent is granted
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

  // Track install immediately on first mount (regardless of consent)
  // This only fires once per installation due to localStorage deduplication
  //
  // PRIVACY NOTE: This sends an anonymous install event before the user grants consent.
  // Data collected: browser platform, user agent, referrer, origin URL, embedded status.
  // A random PostHog distinct_id is generated (not tied to user identity).
  // Users can prevent this by setting VITE_DO_NOT_TRACK=1 or browser's DNT setting.
  // This approach uses "legitimate interest" under GDPR Article 6(1)(f) for basic
  // aggregate analytics. No cross-site tracking, no advertising, no user profiles.
  const hasTrackedInstall = useRef(false);
  useEffect(() => {
    if (!hasTrackedInstall.current) {
      hasTrackedInstall.current = true;
      trackInstall();
    }
  }, []);

  // Track session start when consent is granted
  useEffect(() => {
    if (consent === "granted") {
      trackSessionStart();
    }
  }, [consent]);

  const grantConsent = useCallback(async () => {
    // Must await to ensure PostHog is initialized and opt_in_capturing() is called
    // before the useEffect triggers tracking calls
    await setTelemetryConsent("granted");
    setConsentState("granted");
  }, []);

  const denyConsent = useCallback(async () => {
    await setTelemetryConsent("denied");
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
