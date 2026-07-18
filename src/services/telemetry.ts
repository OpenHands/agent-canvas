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

import type { BootstrapConfig, PostHog } from "posthog-js";
import packageJson from "../../package.json";

const TELEMETRY_CONSENT_KEY = "openhands-telemetry-consent";
const TELEMETRY_CONSENT_PENDING_CLOUD_SYNC_KEY =
  "openhands-telemetry-consent-pending-cloud-sync";
const TELEMETRY_CONSENT_CHANGE_EVENT = "openhands-telemetry-consent-change";
const TELEMETRY_FIRST_USE_KEY = "openhands-telemetry-first-use";
const TELEMETRY_SESSION_KEY = "openhands-telemetry-session";

// PostHog project keys — one per deployment environment, hardcoded so they
// are baked into the static bundle at build time and cannot drift at runtime.
const POSTHOG_PROD_KEY = "phc_BgzfxKdgsYMLFTmJqt424ZoyVHvKFfrwttLimzdYTKFK";
const POSTHOG_STAGING_KEY = "phc_kBtz5nKmxVRRQ7HtPwr2QX9eMC5j65zE86QKocVNwb4U";

// Always use the staging key unless VITE_APP_ENV is explicitly set to
// "production" at bundle time (hardcoded in build:lib and production CI).
// Library consumers can always override with VITE_POSTHOG_API_KEY.
const POSTHOG_API_KEY: string =
  (import.meta.env.VITE_POSTHOG_API_KEY as string | undefined) ||
  (import.meta.env.VITE_APP_ENV === "production"
    ? POSTHOG_PROD_KEY
    : POSTHOG_STAGING_KEY);

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
export type ResolvedTelemetryConsent = Exclude<TelemetryConsent, "pending">;

export interface SetTelemetryConsentOptions {
  /** Do not persist a value mirrored from backend settings back to Cloud. */
  syncToCloud?: boolean;
}

let posthogInstance: PostHog | null = null;
let initializationPromise: Promise<PostHog | null> | null = null;
let pendingBootstrap: BootstrapConfig | undefined;

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
export function configurePostHogBootstrap(
  bootstrap: BootstrapConfig | undefined,
): void {
  if (!posthogInstance && bootstrap) {
    pendingBootstrap = bootstrap;
  }
}

export async function initializePostHogClient(
  enableCapturing = false,
): Promise<PostHog | null> {
  if (posthogInstance) {
    return posthogInstance;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const posthog = await getPostHog();
    if (!posthog) {
      return null;
    }

    // telemetry.ts is the sole owner of the default PostHog client. React is
    // given this exact instance instead of initializing another client.
    posthogInstance = posthog.init(POSTHOG_API_KEY, {
      api_host: POSTHOG_HOST,
      ui_host: POSTHOG_UI_HOST,
      opt_out_capturing_by_default: !enableCapturing,
      capture_pageview: false,
      autocapture: false,
      persistence: "localStorage",
      person_profiles: "identified_only",
      disable_session_recording: true,
      bootstrap: pendingBootstrap,
      loaded: (ph) => {
        ph.register({
          package_name: packageJson.name,
          package_version: packageJson.version,
        });
      },
    });

    return posthogInstance;
  })();

  try {
    return await initializationPromise;
  } finally {
    if (!posthogInstance) {
      initializationPromise = null;
    }
  }
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
 * Return an explicit browser choice that still needs to survive a Cloud login.
 * It remains pending across local backends so their settings cannot consume a
 * decision that must still be applied after the user connects to Cloud.
 */
export function getPendingCloudTelemetryConsent(): ResolvedTelemetryConsent | null {
  if (!isBrowser()) return null;

  try {
    const consent = localStorage.getItem(
      TELEMETRY_CONSENT_PENDING_CLOUD_SYNC_KEY,
    );
    return consent === "granted" || consent === "denied" ? consent : null;
  } catch {
    return null;
  }
}

export function subscribeTelemetryConsent(listener: () => void): () => void {
  if (!isBrowser()) return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === TELEMETRY_CONSENT_KEY ||
      event.key === TELEMETRY_CONSENT_PENDING_CLOUD_SYNC_KEY
    ) {
      listener();
    }
  };
  window.addEventListener(TELEMETRY_CONSENT_CHANGE_EVENT, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(TELEMETRY_CONSENT_CHANGE_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function notifyTelemetryConsentListeners(): void {
  if (isBrowser())
    window.dispatchEvent(new Event(TELEMETRY_CONSENT_CHANGE_EVENT));
}

function markTelemetryConsentForCloudSync(
  consent: ResolvedTelemetryConsent,
): void {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(TELEMETRY_CONSENT_PENDING_CLOUD_SYNC_KEY, consent);
  } catch {
    // Ignore storage errors; the in-browser consent decision still applies.
  }
}

export function clearPendingCloudTelemetryConsent(
  expected?: ResolvedTelemetryConsent,
): void {
  if (!isBrowser()) return;

  try {
    if (
      expected !== undefined &&
      localStorage.getItem(TELEMETRY_CONSENT_PENDING_CLOUD_SYNC_KEY) !==
        expected
    ) {
      return;
    }
    localStorage.removeItem(TELEMETRY_CONSENT_PENDING_CLOUD_SYNC_KEY);
    notifyTelemetryConsentListeners();
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Set user's telemetry consent preference
 */
export async function setTelemetryConsent(
  consent: ResolvedTelemetryConsent,
  { syncToCloud = true }: SetTelemetryConsentOptions = {},
): Promise<void> {
  if (!isBrowser()) {
    return;
  }

  try {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, consent);

    // Reuse an initialized client synchronously so a same-flush identify()
    // cannot run before consent is applied. Only the cold path awaits import.
    const posthog = posthogInstance ?? (await initializePostHogClient());
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
  } finally {
    // Notify UI/backend/identity reconcilers only after the browser capture state
    // reflects this decision. Otherwise a pre-login grant can trigger an
    // identify while PostHog is still opted out and lose funnel continuity.
    if (syncToCloud) {
      markTelemetryConsentForCloudSync(consent);
    }
    notifyTelemetryConsentListeners();
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
  const posthog = await initializePostHogClient(true);
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

/** Return the shared client only when a consented capture is safe to emit. */
async function getPostHogForConsentedCapture(): Promise<PostHog | null> {
  if (!isTelemetryEnabled()) return null;

  const posthog = await initializePostHogClient();
  if (!posthog || !isTelemetryEnabled()) return null;

  // The browser preference is the canonical capture decision. PostHog may
  // still carry an older opt-out marker while backend consent is loading or
  // after a previous backend temporarily reported a stale value. Heal that
  // drift at the event boundary so capture() cannot silently discard an event
  // that the user has explicitly allowed.
  if (posthog.has_opted_out_capturing?.()) {
    posthog.opt_in_capturing();
  }

  return posthog;
}

/**
 * Track a session start event.
 * Called each time a new browser session starts (respects consent).
 * Uses sessionStorage for deduplication - only sends once per browser session.
 */
export async function trackSessionStart(): Promise<void> {
  // Already sent session event this browser session
  if (hasSessionSent()) {
    return;
  }

  const posthog = await getPostHogForConsentedCapture();
  if (!posthog) return;

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
  const posthog = await getPostHogForConsentedCapture();
  if (!posthog) return;

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
    clearPendingCloudTelemetryConsent();
    localStorage.removeItem(TELEMETRY_FIRST_USE_KEY);
    sessionStorage.removeItem(TELEMETRY_SESSION_KEY);

    // Reset PostHog if initialized
    if (posthogInstance) {
      posthogInstance.opt_out_capturing();
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
  return posthogInstance;
}
