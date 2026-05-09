/**
 * Telemetry service for tracking library usage.
 *
 * This module handles anonymous telemetry for the @openhands/agent-canvas package
 * using the PostHog SDK for reliable event delivery with batching, retry logic,
 * and offline support.
 *
 * TRACKING PHILOSOPHY:
 * - Install event (canvas_install): Sent immediately on first use, regardless of consent.
 *   This is anonymous and contains no PII - just basic browser info and a random ID.
 * - Session/custom events: Only sent after user grants consent via the consent modal.
 * - Users can opt out of all future tracking by declining consent.
 *
 * AD BLOCKER BYPASS:
 * By default, telemetry is routed through OpenHands' reverse proxy (z.openhands.dev)
 * to avoid being blocked by ad blockers. Library consumers can override this with:
 * - VITE_POSTHOG_HOST: Custom proxy URL or direct PostHog URL
 * - VITE_POSTHOG_UI_HOST: PostHog UI host (defaults to https://us.posthog.com)
 *
 * IMPORTANT: By default, telemetry is sent to the OpenHands PostHog project.
 * Library consumers can override this by setting VITE_POSTHOG_API_KEY.
 *
 * Users can disable all telemetry (including install tracking) via:
 * - Setting VITE_DO_NOT_TRACK=1 environment variable
 * - Browser's Do Not Track setting
 */

import type { PostHog } from "posthog-js";
import packageJson from "../../package.json";

const TELEMETRY_CONSENT_KEY = "openhands-telemetry-consent";
const TELEMETRY_FIRST_USE_KEY = "openhands-telemetry-first-use";
const TELEMETRY_SESSION_KEY = "openhands-telemetry-session";

// PostHog configuration - configurable via env vars with OpenHands defaults
// Note: The default API key sends telemetry to OpenHands' PostHog project.
// Library consumers can override this with their own PostHog project key.
const POSTHOG_API_KEY =
  import.meta.env.VITE_POSTHOG_API_KEY ||
  "phc_BgzfxKdgsYMLFTmJqt424ZoyVHvKFfrwttLimzdYTKFK";

// Default to OpenHands' reverse proxy to bypass ad blockers.
// The proxy at z.openhands.dev routes to PostHog's US region.
// Library consumers can override this with their own proxy or direct PostHog URL.
const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || "https://z.openhands.dev";

// UI host is needed for PostHog features like toolbar to work correctly
// when using a reverse proxy. Defaults to US region.
const POSTHOG_UI_HOST =
  import.meta.env.VITE_POSTHOG_UI_HOST || "https://us.posthog.com";

export type TelemetryConsent = "granted" | "denied" | "pending";

let isInitialized = false;
let posthogInstance: PostHog | null = null;

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * Lazily load PostHog to avoid SSR/Node.js issues.
 * PostHog is a browser-only library, so we dynamically import it only when needed.
 */
async function getPostHog(): Promise<PostHog | null> {
  if (!isBrowser()) {
    return null;
  }

  if (posthogInstance) {
    return posthogInstance;
  }

  try {
    const { default: posthog } = await import("posthog-js");
    posthogInstance = posthog;
    return posthog;
  } catch {
    // Failed to load PostHog - telemetry will be disabled
    return null;
  }
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
 * Initialize PostHog SDK.
 *
 * @param enableCapturing - If true, enable capturing immediately (for install tracking).
 *                          If false, start with capturing disabled (for consent-gated tracking).
 */
async function initializePostHog(
  enableCapturing = false,
): Promise<PostHog | null> {
  if (isInitialized) {
    return posthogInstance;
  }

  const posthog = await getPostHog();
  if (!posthog) {
    return null;
  }

  posthog.init(POSTHOG_API_KEY, {
    api_host: POSTHOG_HOST,
    // UI host is required when using a reverse proxy so PostHog features work correctly
    ui_host: POSTHOG_UI_HOST,
    // Start with capturing disabled by default - we enable it explicitly when needed
    opt_out_capturing_by_default: !enableCapturing,
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
  return posthog;
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
export async function setTelemetryConsent(
  consent: "granted" | "denied",
): Promise<void> {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, consent);

    // Initialize PostHog if not already done
    const posthog = await initializePostHog();
    if (!posthog) {
      return;
    }

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
 * Track the initial install of the library.
 *
 * IMPORTANT: This is sent immediately on first use, regardless of consent status.
 * This allows us to track library adoption even if users haven't made a consent choice yet.
 *
 * The event is:
 * - Completely anonymous (no PII, just a random PostHog distinct_id)
 * - Sent only once per installation (tracked via localStorage, persists across sessions)
 * - Still respects DO_NOT_TRACK environment variable and browser setting
 *
 * Users who want complete privacy can:
 * - Set VITE_DO_NOT_TRACK=1 or browser's Do Not Track
 * - Later deny consent to prevent all future tracking
 */
export async function trackInstall(): Promise<void> {
  // Respect hard opt-out via environment variable or browser setting
  if (isDoNotTrackEnabled()) {
    return;
  }

  // Already sent install event (persisted in localStorage - survives app relaunches)
  if (hasFirstUseSent()) {
    return;
  }

  // Initialize PostHog with capturing enabled (for this one event)
  const posthog = await initializePostHog(true);
  if (!posthog) {
    return;
  }

  // Temporarily enable capturing if it was disabled
  const wasOptedOut = posthog.has_opted_out_capturing?.() ?? false;
  if (wasOptedOut) {
    posthog.opt_in_capturing();
  }

  // Capture the install event
  posthog.capture("canvas_install", {
    platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
    user_agent:
      typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    referrer: typeof document !== "undefined" ? document.referrer : "",
    url_origin: typeof window !== "undefined" ? window.location.origin : "",
    embedded: typeof window !== "undefined" && window.self !== window.top,
  });

  // Mark as sent (stored in localStorage - persists across browser sessions)
  markFirstUseSent();

  // Restore opt-out state if user hasn't granted consent yet
  // This ensures we only send the install event, not subsequent events
  const currentConsent = getTelemetryConsent();
  if (currentConsent !== "granted") {
    posthog.opt_out_capturing();
  }
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
  const posthog = await initializePostHog();
  if (!posthog) {
    return;
  }

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
  const posthog = await initializePostHog();
  if (!posthog) {
    return;
  }

  posthog.capture(eventName, properties);
}

/**
 * Clear all telemetry data (for privacy/GDPR requests)
 */
export async function clearTelemetryData(): Promise<void> {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.removeItem(TELEMETRY_CONSENT_KEY);
    localStorage.removeItem(TELEMETRY_FIRST_USE_KEY);
    sessionStorage.removeItem(TELEMETRY_SESSION_KEY);

    // Reset PostHog if initialized
    if (isInitialized && posthogInstance) {
      posthogInstance.reset();
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the PostHog instance for advanced usage (if needed).
 * Returns the instance if initialized, otherwise null.
 * Note: This is async because PostHog is lazily loaded.
 */
export async function getPostHogInstance(): Promise<PostHog | null> {
  if (!isInitialized) {
    return null;
  }
  return posthogInstance;
}
