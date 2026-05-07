/**
 * Telemetry service for tracking library usage with user consent.
 *
 * This module handles anonymous telemetry for the @openhands/agent-canvas package
 * using the PostHog SDK for reliable event delivery with batching, retry logic,
 * and offline support.
 *
 * All telemetry is sent to the OpenHands PostHog project. Users can opt out via:
 * - Declining consent in the UI
 * - Setting VITE_DO_NOT_TRACK=1 environment variable
 * - Browser's Do Not Track setting
 */

import posthog from "posthog-js";
import packageJson from "../../package.json";

const TELEMETRY_CONSENT_KEY = "openhands-telemetry-consent";
const TELEMETRY_FIRST_USE_KEY = "openhands-telemetry-first-use";
const TELEMETRY_SESSION_KEY = "openhands-telemetry-session";

// PostHog configuration - configurable via env vars with OpenHands defaults
const POSTHOG_API_KEY =
  import.meta.env.VITE_POSTHOG_API_KEY ||
  "phc_BgzfxKdgsYMLFTmJqt424ZoyVHvKFfrwttLimzdYTKFK";
const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

export type TelemetryConsent = "granted" | "denied" | "pending";

let isInitialized = false;

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * Check if telemetry is disabled via environment variable or browser setting.
 * Works in both Node.js and browser (Vite) environments.
 */
function isDoNotTrackEnabled(): boolean {
  // Check Vite environment variable (browser)
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_DO_NOT_TRACK === "1"
  ) {
    return true;
  }

  // Check Node.js environment variable (SSR/testing)
  if (typeof process !== "undefined" && process.env?.DO_NOT_TRACK === "1") {
    return true;
  }

  // Check browser's navigator.doNotTrack standard
  if (
    typeof navigator !== "undefined" &&
    (navigator.doNotTrack === "1" ||
      // @ts-expect-error - Some browsers use window.doNotTrack
      (typeof window !== "undefined" && window.doNotTrack === "1"))
  ) {
    return true;
  }

  return false;
}

/**
 * Initialize PostHog SDK (called once on first consent grant)
 */
function initializePostHog(): void {
  if (isInitialized || !isBrowser()) {
    return;
  }

  posthog.init(POSTHOG_API_KEY, {
    api_host: POSTHOG_HOST,
    // Start with capturing disabled - we enable it when consent is granted
    opt_out_capturing_by_default: true,
    // Don't auto-capture page views - we control when to track
    capture_pageview: false,
    // Don't auto-capture clicks etc.
    autocapture: false,
    // Use localStorage for persistence
    persistence: "localStorage",
    // Disable session recording
    disable_session_recording: true,
    // Set default properties for all events
    loaded: (ph) => {
      ph.register({
        package_name: packageJson.name,
        package_version: packageJson.version,
      });
    },
  });

  isInitialized = true;
}

/**
 * Get user's telemetry consent preference
 */
export function getTelemetryConsent(): TelemetryConsent {
  if (!isBrowser()) {
    return "pending";
  }

  // Check environment variable for opt-out
  if (isDoNotTrackEnabled()) {
    return "denied";
  }

  try {
    const consent = localStorage.getItem(TELEMETRY_CONSENT_KEY);
    if (consent === "granted" || consent === "denied") {
      return consent;
    }
  } catch {
    // Ignore storage errors
  }

  return "pending";
}

/**
 * Set user's telemetry consent preference
 */
export function setTelemetryConsent(consent: "granted" | "denied"): void {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, consent);

    // Initialize PostHog if not already done
    initializePostHog();

    if (consent === "granted") {
      // Enable capturing
      posthog.opt_in_capturing();
    } else {
      // Disable capturing and clear any queued events
      posthog.opt_out_capturing();
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if telemetry is enabled (user has granted consent)
 */
export function isTelemetryEnabled(): boolean {
  return getTelemetryConsent() === "granted";
}

/**
 * Check if first use event has already been sent
 */
function hasFirstUseSent(): boolean {
  if (!isBrowser()) {
    return false;
  }

  try {
    return localStorage.getItem(TELEMETRY_FIRST_USE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Mark first use event as sent
 */
function markFirstUseSent(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.setItem(TELEMETRY_FIRST_USE_KEY, "true");
  } catch {
    // Ignore storage errors
  }
}

/**
 * Track the first use of the library.
 * This is called when the library components are first mounted.
 * It only sends an event once per installation (tracked via localStorage).
 */
export async function trackFirstUse(): Promise<void> {
  // Check consent first
  if (!isTelemetryEnabled()) {
    return;
  }

  // Already sent first use event
  if (hasFirstUseSent()) {
    return;
  }

  // Initialize PostHog if needed
  initializePostHog();

  // Capture the event
  posthog.capture("canvas_install", {
    platform:
      typeof navigator !== "undefined" ? navigator.platform : "unknown",
    user_agent:
      typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    referrer: typeof document !== "undefined" ? document.referrer : "",
    url_origin: typeof window !== "undefined" ? window.location.origin : "",
    embedded: typeof window !== "undefined" && window.self !== window.top,
  });

  // Mark as sent
  markFirstUseSent();
}

/**
 * Check if session start event has already been sent (this browser session)
 */
function hasSessionSent(): boolean {
  if (!isBrowser()) {
    return false;
  }

  try {
    return sessionStorage.getItem(TELEMETRY_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Mark session start event as sent (uses sessionStorage so it resets on new tabs/sessions)
 */
function markSessionSent(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    sessionStorage.setItem(TELEMETRY_SESSION_KEY, "true");
  } catch {
    // Ignore storage errors
  }
}

/**
 * Track a session start event.
 * Called each time a new browser session starts (respects consent).
 * Uses sessionStorage for deduplication - only sends once per browser session.
 */
export async function trackSessionStart(): Promise<void> {
  if (!isTelemetryEnabled()) {
    return;
  }

  // Already sent session event this browser session
  if (hasSessionSent()) {
    return;
  }

  // Initialize PostHog if needed
  initializePostHog();

  posthog.capture("canvas_new_session", {
    is_first_use: !hasFirstUseSent(),
  });

  // Mark as sent for this session
  markSessionSent();
}

/**
 * Track a custom event (respects consent).
 */
export async function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!isTelemetryEnabled()) {
    return;
  }

  // Initialize PostHog if needed
  initializePostHog();

  posthog.capture(eventName, properties);
}

/**
 * Clear all telemetry data (for privacy/GDPR requests)
 */
export function clearTelemetryData(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.removeItem(TELEMETRY_CONSENT_KEY);
    localStorage.removeItem(TELEMETRY_FIRST_USE_KEY);
    sessionStorage.removeItem(TELEMETRY_SESSION_KEY);

    // Reset PostHog
    if (isInitialized) {
      posthog.reset();
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the PostHog instance for advanced usage (if needed)
 */
export function getPostHogInstance(): typeof posthog | null {
  if (!isInitialized) {
    return null;
  }
  return posthog;
}
