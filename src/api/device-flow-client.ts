/**
 * OAuth 2.0 Device Flow client implementation (RFC 8628).
 *
 * Used for one-click authentication with OpenHands Cloud backends.
 * The flow allows users to authenticate in their browser while the
 * application polls for the resulting API key.
 *
 * For known OpenHands Cloud hosts, requests are proxied through the local
 * agent-server to avoid CORS issues. For self-hosted instances, direct
 * requests are made (assuming they have CORS configured).
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
 * Check if a host is a known OpenHands Cloud domain that requires proxying.
 */
export function isOpenHandsCloudHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  return trimmed.includes("all-hands.dev") || trimmed.includes("openhands.dev");
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
  });

  return response;
}

/**
 * Make a direct request to the target host.
 * Used for self-hosted instances that have CORS configured.
 */
async function makeDirectRequest(
  url: string,
  method: "GET" | "POST",
  body?: unknown,
  contentType?: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    method,
    headers: contentType ? { "Content-Type": contentType } : {},
    body: body
      ? contentType?.includes("form")
        ? (body as BodyInit)
        : JSON.stringify(body)
      : undefined,
    signal,
  });
}

/**
 * Start the OAuth 2.0 Device Flow by requesting a device code.
 *
 * @param host - The OpenHands Cloud host URL (e.g., "https://app.all-hands.dev")
 * @returns DeviceAuthorizationResponse with device_code, user_code, verification URLs, etc.
 * @throws DeviceFlowError if the request fails
 */
export async function startDeviceFlow(
  host: string,
): Promise<DeviceAuthorizationResponse> {
  const normalizedHost = host.replace(/\/+$/, "");
  const useProxy = isOpenHandsCloudHost(host);

  try {
    let response: Response;

    if (useProxy) {
      response = await makeProxiedRequest(
        normalizedHost,
        "POST",
        "/oauth/device/authorize",
        {},
        "application/json",
      );
    } else {
      response = await makeDirectRequest(
        `${normalizedHost}/oauth/device/authorize`,
        "POST",
        {},
        "application/json",
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new DeviceFlowError(
        `Failed to start device flow: ${response.status} ${errorText}`,
      );
    }

    const data = await response.json();

    // Validate required fields
    if (
      !data.device_code ||
      !data.user_code ||
      !data.verification_uri ||
      !data.verification_uri_complete
    ) {
      throw new DeviceFlowError(
        "Invalid response from device authorization endpoint: missing required fields",
      );
    }

    return {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      verification_uri_complete: data.verification_uri_complete,
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
 *
 * @param host - The OpenHands Cloud host URL
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
  const useProxy = isOpenHandsCloudHost(host);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  let interval = options.interval * 1000; // Convert to milliseconds
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Check if cancelled
    if (options.signal?.aborted) {
      throw new DeviceFlowError("Authorization cancelled", "cancelled");
    }

    try {
      let response: Response;

      if (useProxy) {
        // For proxied requests, send the form data as a string in the body
        // The proxy will forward it with the correct content type
        response = await makeProxiedRequest(
          normalizedHost,
          "POST",
          "/oauth/device/token",
          `device_code=${encodeURIComponent(deviceCode)}`,
          "application/x-www-form-urlencoded",
        );
      } else {
        response = await fetch(`${normalizedHost}/oauth/device/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ device_code: deviceCode }),
          signal: options.signal,
        });
      }

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
          if (errorData.interval != null) {
            interval = errorData.interval * 1000;
          } else {
            interval = Math.min(interval * 2, MAX_INTERVAL_MS);
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
      if (error instanceof DeviceFlowError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DeviceFlowError("Authorization cancelled", "cancelled");
      }
      throw new DeviceFlowError(
        `Network error during token polling: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Wait before next poll
    await sleep(interval, options.signal);
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
