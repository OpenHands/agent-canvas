import React from "react";
import {
  startDeviceFlow,
  pollForToken,
  DeviceFlowError,
  type DeviceAuthorizationResponse,
} from "#/api/device-flow-client";

export type DeviceFlowStatus =
  | "idle"
  | "starting"
  | "awaiting_authorization"
  | "success"
  | "error";

export interface DeviceFlowState {
  status: DeviceFlowStatus;
  /** The verification URL to show/open for the user */
  verificationUrl: string | null;
  /** User code to display as fallback */
  userCode: string | null;
  /** The resulting OpenHands Cloud API key on success */
  apiKey: string | null;
  /** Error message if status is "error" */
  error: string | null;
  /** Error code for programmatic handling */
  errorCode: string | null;
}

export interface UseDeviceFlowReturn extends DeviceFlowState {
  /** Start the device flow authentication */
  start: (host: string) => void;
  /** Cancel an in-progress flow */
  cancel: () => void;
  /** Reset state back to idle */
  reset: () => void;
}

const initialState: DeviceFlowState = {
  status: "idle",
  verificationUrl: null,
  userCode: null,
  apiKey: null,
  error: null,
  errorCode: null,
};

/**
 * React hook for managing OAuth 2.0 Device Flow authentication.
 *
 * Usage:
 * ```tsx
 * const { status, verificationUrl, apiKey, error, start, cancel, reset } = useDeviceFlow();
 *
 * // Start auth
 * start("https://app.all-hands.dev");
 *
 * // Open browser when awaiting
 * if (status === "awaiting_authorization" && verificationUrl) {
 *   window.open(verificationUrl, "_blank");
 * }
 *
 * // Use OpenHands Cloud API key on success
 * if (status === "success" && apiKey) {
 *   setApiKeyField(apiKey);
 * }
 * ```
 */
export function useDeviceFlow(): UseDeviceFlowReturn {
  const [state, setState] = React.useState<DeviceFlowState>(initialState);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const mountedRef = React.useRef(false);

  const isActive = React.useCallback((signal?: AbortSignal) => {
    return mountedRef.current && !signal?.aborted;
  }, []);

  const start = React.useCallback(
    (host: string) => {
      // Cancel any existing flow
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (!isActive(abortController.signal)) return;
      setState({
        ...initialState,
        status: "starting",
      });

      (async () => {
        let authResponse: DeviceAuthorizationResponse;

        try {
          authResponse = await startDeviceFlow(host);
        } catch (error) {
          if (!isActive(abortController.signal)) return;

          const message =
            error instanceof Error
              ? error.message
              : "Failed to start device flow";
          const code =
            error instanceof DeviceFlowError ? error.code : undefined;

          setState({
            ...initialState,
            status: "error",
            error: message,
            errorCode: code ?? null,
          });
          return;
        }

        if (!isActive(abortController.signal)) return;

        setState({
          ...initialState,
          status: "awaiting_authorization",
          verificationUrl: authResponse.verification_uri_complete,
          userCode: authResponse.user_code,
        });

        try {
          const tokenResponse = await pollForToken(
            host,
            authResponse.device_code,
            {
              interval: authResponse.interval,
              signal: abortController.signal,
            },
          );

          if (!isActive(abortController.signal)) return;

          setState({
            ...initialState,
            status: "success",
            apiKey: tokenResponse.access_token,
          });
        } catch (error) {
          // Early return if component unmounted or user cancelled
          if (!isActive(abortController.signal)) return;

          // Defensive: handle cancellation errors that may slip through
          // (currently pollForToken only throws "cancelled" when signal.aborted,
          // which is caught above, but this guards against future changes)
          const isCancel =
            error instanceof DeviceFlowError && error.code === "cancelled";
          if (isCancel) {
            if (!isActive(abortController.signal)) return;
            setState(initialState);
            return;
          }

          const message =
            error instanceof Error ? error.message : "Authorization failed";
          const code =
            error instanceof DeviceFlowError ? error.code : undefined;

          if (!isActive(abortController.signal)) return;
          setState({
            ...initialState,
            status: "error",
            error: message,
            errorCode: code ?? null,
          });
        }
      })();
    },
    [isActive],
  );

  const cancel = React.useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (!mountedRef.current) return;
    setState(initialState);
  }, []);

  const reset = React.useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (!mountedRef.current) return;
    setState(initialState);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    ...state,
    start,
    cancel,
    reset,
  };
}
