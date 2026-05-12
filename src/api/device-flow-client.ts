/**
 * OAuth 2.0 Device Flow client implementation (RFC 8628).
 *
 * Used for one-click authentication with cloud backends.
 * The flow allows users to authenticate in their browser while the
 * application polls for the resulting API key.
 *
 * All device flow requests are proxied through the local agent-server's
 * cloud-proxy endpoint to avoid CORS issues. Since a local agent-server
 * is required to use the frontend, the proxy is always available.
 */

import { getEffectiveLocalBackend } from "./backend-registry/active-store";
import { buildAuthHeaders } from "./backend-registry/auth";

export class DeviceFlowError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "DeviceFlowError";
  }
}

export interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface DeviceTokenErrorResponse {
  error: string;
  error_description?: string;
  interval?: number;
}

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
const MAX_INTERVAL_MS = 30_000; // 30 seconds max polling interval

/**
 * Check if a host is a known OpenHands Cloud domain.
 * Uses hostname extraction to prevent substring matching attacks.
 */
export function isOpenHandsCloudHost(host: string): boolean {
  try {
    // Extract hostname from URL or treat as hostname if no protocol
    const trimmed = host.trim().toLowerCase();
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const hostname = url.hostname;

    // Check if hostname ends with known domains (exact suffix match)
    return (
      hostname.endsWith(".all-hands.dev") ||
      hostname === "all-hands.dev" ||
      hostname.endsWith(".openhands.dev") ||
      hostname === "openhands.dev"
    );
  } catch {
    return false;
  }
}

/**
 * Make a proxied request through the local agent-server's cloud-proxy endpoint.
 * This avoids CORS issues when calling OpenHands Cloud endpoints.
 */
async function makeProxiedRequest(
  upstreamHost: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  contentType?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const local = getEffectiveLocalBackend();
  const proxyUrl = `${local.host.replace(/\/+$/, "")}/api/cloud-proxy`;

  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(local),
    },
    body: JSON.stringify({
      host: upstreamHost,
      method,
      path,
      headers: contentType ? { "Content-Type": contentType } : {},
      body: body ?? null,
    }),
    signal,
  });

  return response;
}

/**
 * Start the OAuth 2.0 Device Flow by requesting a device code.
 * All requests are proxied through the local agent-server to avoid CORS issues.
 *
 * @param host - The cloud backend host URL (e.g., "https://app.all-hands.dev")
 * @returns DeviceAuthorizationResponse with device_code, user_code, verification URLs, etc.
 * @throws DeviceFlowError if the request fails
 */
export async function startDeviceFlow(
  host: string,
): Promise<DeviceAuthorizationResponse> {
  const normalizedHost = host.replace(/\/+$/, "");

  try {
    const response = await makeProxiedRequest(
      normalizedHost,
      "POST",
      "/oauth/device/authorize",
      {},
      "application/json",
    );

    if (!response.ok) {
      // Avoid exposing sensitive server error details
      throw new DeviceFlowError(
        `Failed to start device flow: Server returned ${response.status}`,
      );
    }

    const data = await response.json();

    // Validate required fields per RFC 8628 Section 3.2
    // verification_uri_complete is OPTIONAL per RFC
    if (!data.device_code || !data.user_code || !data.verification_uri) {
      throw new DeviceFlowError(
        "Invalid response from device authorization endpoint: missing required fields",
      );
    }

    // Build verification_uri_complete if not provided (optional per RFC)
    const verificationUriComplete =
      data.verification_uri_complete ??
      `${data.verification_uri}?user_code=${encodeURIComponent(data.user_code)}`;

    return {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      verification_uri_complete: verificationUriComplete,
      expires_in: data.expires_in ?? 600,
      interval: data.interval ?? 5,
    };
  } catch (error) {
    if (error instanceof DeviceFlowError) {
      throw error;
    }
    throw new DeviceFlowError(
      `Failed to start device flow: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface PollOptions {
  /** Polling interval in seconds (from device authorization response) */
  interval: number;
  /** Maximum time to wait for authorization in milliseconds */
  timeout?: number;
  /** Abort signal to cancel polling */
  signal?: AbortSignal;
}

/**
 * Poll for the API key after user authorization.
 * All requests are proxied through the local agent-server to avoid CORS issues.
 *
 * @param host - The cloud backend host URL
 * @param deviceCode - The device code from startDeviceFlow
 * @param options - Polling options including interval, timeout, and abort signal
 * @returns DeviceTokenResponse containing the access_token (API key)
 * @throws DeviceFlowError if polling fails, user denies access, or timeout expires
 */
export async function pollForToken(
  host: string,
  deviceCode: string,
  options: PollOptions,
): Promise<DeviceTokenResponse> {
  const normalizedHost = host.replace(/\/+$/, "");
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  let interval = Math.max(1, options.interval) * 1000; // At least 1 second
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Check if cancelled
    if (options.signal?.aborted) {
      throw new DeviceFlowError("Authorization cancelled", "cancelled");
    }

    try {
      // RFC 8628 Section 3.4 requires grant_type parameter
      const tokenRequestBody = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
      }).toString();

      const response = await makeProxiedRequest(
        normalizedHost,
        "POST",
        "/oauth/device/token",
        tokenRequestBody,
        "application/x-www-form-urlencoded",
        options.signal,
      );

      if (response.ok) {
        const data = await response.json();
        if (!data.access_token) {
          throw new DeviceFlowError(
            "Invalid token response: missing access_token",
          );
        }
        return {
          access_token: data.access_token,
          token_type: data.token_type ?? "Bearer",
          expires_in: data.expires_in,
        };
      }

      // Handle error responses
      let errorData: DeviceTokenErrorResponse;
      try {
        errorData = await response.json();
      } catch {
        throw new DeviceFlowError(
          `Unexpected response from server: ${response.status}`,
        );
      }

      const { error, error_description } = errorData;

      switch (error) {
        case "authorization_pending":
          // User hasn't finished yet; continue polling
          break;

        case "slow_down":
          // Server asks us to poll less frequently
          // RFC 8628 Section 3.5: "the client MUST increase its polling interval by 5 seconds"
          // Validate server-provided interval to prevent DoS (must be number, finite, positive)
          if (
            typeof errorData.interval === "number" &&
            isFinite(errorData.interval) &&
            errorData.interval > 0
          ) {
            interval = Math.max(1, Math.min(errorData.interval, 30)) * 1000;
          } else {
            // RFC 8628 mandates incrementing by 5 seconds
            interval = Math.min(interval + 5000, MAX_INTERVAL_MS);
          }
          break;

        case "expired_token":
          throw new DeviceFlowError(
            "Device code has expired. Please try again.",
            "expired_token",
          );

        case "access_denied":
          throw new DeviceFlowError(
            "Authorization request was denied.",
            "access_denied",
          );

        default:
          throw new DeviceFlowError(
            `Authorization error: ${error}${error_description ? ` - ${error_description}` : ""}`,
            error,
          );
      }
    } catch (error) {
      // DeviceFlowError means a definitive error (denied, expired, etc.) - rethrow
      if (error instanceof DeviceFlowError) {
        throw error;
      }
      // User cancelled - rethrow
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DeviceFlowError("Authorization cancelled", "cancelled");
      }
      // Network errors during polling should continue until timeout, not fail immediately
      // Brief network hiccups shouldn't abort 10-minute flows
      console.warn("Network error during polling, retrying:", error);
    }

    // Wait before next poll (wrap in try-catch for consistent abort handling)
    try {
      await sleep(interval, options.signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DeviceFlowError("Authorization cancelled", "cancelled");
      }
      throw error;
    }
  }

  throw new DeviceFlowError(
    "Timeout waiting for authorization. Please try again.",
    "timeout",
  );
}

/**
 * Sleep for a given duration, respecting an optional abort signal.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
