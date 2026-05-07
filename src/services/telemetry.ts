/**
 * Telemetry service for tracking library usage with user consent.
 *
 * This module handles anonymous telemetry for the @openhands/agent-canvas package.
 * It tracks "first use" events (not installs) and respects user privacy preferences.
 *
 * All telemetry is sent to the OpenHands PostHog project. Users can opt out via:
 * - Declining consent in the UI
 * - Setting VITE_DO_NOT_TRACK=1 environment variable
 * - Browser's Do Not Track setting
 */

import packageJson from "../../package.json";

const TELEMETRY_STORAGE_KEY = "openhands-telemetry";
const TELEMETRY_CONSENT_KEY = "openhands-telemetry-consent";

// PostHog US Cloud endpoint for telemetry collection
const TELEMETRY_ENDPOINT = "https://us.i.posthog.com/capture";

// OpenHands PostHog project API key
const POSTHOG_API_KEY = "phc_BgzfxKdgsYMLFTmJqt424ZoyVHvKFfrwttLimzdYTKFK";

export type TelemetryConsent = "granted" | "denied" | "pending";

export interface TelemetryState {
  firstUseSent: boolean;
  sessionId: string;
  lastSeen: number;
}

export interface TelemetryEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp?: string;
}

/**
 * Generate a simple anonymous ID for telemetry
 * This does not identify the user, just provides event correlation
 */
function generateAnonymousId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Get the current telemetry state from localStorage
 */
function getTelemetryState(): TelemetryState | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as TelemetryState;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Save telemetry state to localStorage
 */
function saveTelemetryState(state: TelemetryState): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

/**
 * Check if telemetry is disabled via environment variable.
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
 * Get user's telemetry consent preference
 */
export function getTelemetryConsent(): TelemetryConsent {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "pending";
  }

  // Check environment variable for opt-out (works in both Node.js and browser)
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
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, consent);
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
 * Send a telemetry event to the collection endpoint
 */
async function sendTelemetryEvent(event: TelemetryEvent): Promise<boolean> {
  try {
    const response = await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
      }),
    });

    return response.ok;
  } catch {
    // Silent fail - telemetry should never break the app
    return false;
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

  const state = getTelemetryState();

  // Already sent first use event
  if (state?.firstUseSent) {
    return;
  }

  const sessionId = state?.sessionId || generateAnonymousId();
  const newState: TelemetryState = {
    firstUseSent: true,
    sessionId,
    lastSeen: Date.now(),
  };

  // Send the event
  const success = await sendTelemetryEvent({
    event: "library_first_use",
    distinct_id: sessionId,
    properties: {
      package_name: packageJson.name,
      package_version: packageJson.version,
      platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      referrer: typeof document !== "undefined" ? document.referrer : "",
      url_origin: typeof window !== "undefined" ? window.location.origin : "",
      embedded: typeof window !== "undefined" && window.self !== window.top,
    },
  });

  // Only save state if event was sent successfully
  if (success) {
    saveTelemetryState(newState);
  }
}

/**
 * Track a session start event.
 * Called each time the library is loaded (respects consent).
 */
export async function trackSessionStart(): Promise<void> {
  if (!isTelemetryEnabled()) {
    return;
  }

  const state = getTelemetryState();
  const sessionId = state?.sessionId || generateAnonymousId();

  await sendTelemetryEvent({
    event: "library_session_start",
    distinct_id: sessionId,
    properties: {
      package_name: packageJson.name,
      package_version: packageJson.version,
      is_first_use: !state?.firstUseSent,
    },
  });

  // Update last seen
  saveTelemetryState({
    firstUseSent: state?.firstUseSent || false,
    sessionId,
    lastSeen: Date.now(),
  });
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

  const state = getTelemetryState();
  const sessionId = state?.sessionId || generateAnonymousId();

  await sendTelemetryEvent({
    event: eventName,
    distinct_id: sessionId,
    properties: {
      package_name: packageJson.name,
      package_version: packageJson.version,
      ...properties,
    },
  });
}

/**
 * Clear all telemetry data (for privacy/GDPR requests)
 */
export function clearTelemetryData(): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(TELEMETRY_STORAGE_KEY);
    localStorage.removeItem(TELEMETRY_CONSENT_KEY);
  } catch {
    // Ignore storage errors
  }
}
