import React from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useDeviceFlow } from "#/hooks/use-device-flow";
import { I18nKey } from "#/i18n/declaration";
import { isOpenHandsCloudHost } from "#/api/device-flow-client";

interface DeviceFlowAuthProps {
  /** The host URL for the cloud backend */
  host: string;
  /**
   * Callback when authentication succeeds with the OpenHands Cloud API key.
   * This component stores the latest callback in a ref and only invokes it
   * while mounted; callers doing additional async work should keep their own
   * mount/abort guard before setting parent state.
   */
  onSuccess: (apiKey: string) => void;
  /** Test ID prefix for the component */
  testIdRoot: string;
  /** Whether the login button should be disabled (e.g., when no host is entered) */
  isDisabled?: boolean;
}

/**
 * Device Flow authentication UI component.
 *
 * Shows a "Login with OpenHands Cloud" button that initiates OAuth 2.0 Device Flow
 * authentication. Displays status during the auth process and auto-opens
 * the browser for user authorization. The returned key authenticates
 * OpenHands Cloud; callers that need an LM API key must exchange it with Cloud.
 */
/**
 * Validate that a URL is safe to open in a popup.
 * Prevents XSS via javascript: URLs or other malicious schemes.
 */
function isValidVerificationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && isOpenHandsCloudHost(parsed.origin);
  } catch {
    return false;
  }
}

function detachPopupOpener(popup: Window | null): Window | null {
  if (!popup) return null;
  const openedPopup = popup;

  try {
    openedPopup.opener = null;
  } catch {
    // Some browsers restrict opener mutation; fallback links still use noopener.
  }

  return openedPopup;
}

export function DeviceFlowAuth({
  host,
  onSuccess,
  testIdRoot,
  isDisabled = false,
}: DeviceFlowAuthProps) {
  const { t } = useTranslation("openhands");
  const deviceFlow = useDeviceFlow();
  const popupRef = React.useRef<Window | null>(null);
  const mountedRef = React.useRef(false);
  const processedApiKeyRef = React.useRef<string | null>(null);
  const onSuccessRef = React.useRef(onSuccess);
  const [isPopupBlocked, setIsPopupBlocked] = React.useState(false);
  const [hostValidationError, setHostValidationError] = React.useState<
    string | null
  >(null);

  const closeAuthPopup = React.useCallback(() => {
    popupRef.current?.close();
    popupRef.current = null;
  }, []);

  React.useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // Close popup on unmount or when auth completes/errors
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closeAuthPopup();
    };
  }, [closeAuthPopup]);

  // Navigate the popup once the device flow returns the verification URL.
  React.useEffect(() => {
    const popup = popupRef.current;
    if (
      deviceFlow.status !== "awaiting_authorization" ||
      !deviceFlow.verificationUrl ||
      !popup ||
      popup.closed
    ) {
      return;
    }

    // Validate URL before assigning to prevent XSS
    if (!isValidVerificationUrl(deviceFlow.verificationUrl)) {
      console.error("Invalid verification URL");
      closeAuthPopup();
      return;
    }

    try {
      popup.location.href = deviceFlow.verificationUrl;
    } catch {
      // Cross-origin error - popup was navigated away
      // Open a new one as fallback
      closeAuthPopup();
      if (!mountedRef.current) return;
      popupRef.current = detachPopupOpener(
        window.open(
          deviceFlow.verificationUrl,
          "_blank",
          "noopener,noreferrer",
        ),
      );
      if (!popupRef.current) {
        setIsPopupBlocked(true);
      }
    }
  }, [closeAuthPopup, deviceFlow.status, deviceFlow.verificationUrl]);

  // Apply successful auth results independently from popup navigation.
  React.useEffect(() => {
    if (deviceFlow.status !== "success" || !deviceFlow.apiKey) return;
    if (
      !mountedRef.current ||
      processedApiKeyRef.current === deviceFlow.apiKey
    ) {
      return;
    }

    try {
      if (!mountedRef.current) return;
      processedApiKeyRef.current = deviceFlow.apiKey;
      onSuccessRef.current(deviceFlow.apiKey);
    } finally {
      if (mountedRef.current) {
        deviceFlow.reset();
        closeAuthPopup();
      }
    }
  }, [closeAuthPopup, deviceFlow.apiKey, deviceFlow.reset, deviceFlow.status]);

  // Close stale auth popups on errors.
  React.useEffect(() => {
    if (deviceFlow.status === "error") {
      closeAuthPopup();
    }
  }, [closeAuthPopup, deviceFlow.status]);

  const handleStartAuth = () => {
    // Normalize and validate the host URL
    const normalizedHost = host.trim().replace(/\/+$/, "");
    const fullHost = /^https?:\/\//i.test(normalizedHost)
      ? normalizedHost
      : `https://${normalizedHost}`;

    // Validate URL before proceeding
    try {
      const url = new URL(fullHost);
      // Check for URL manipulation attacks
      if (url.username || url.password) {
        throw new Error("Invalid URL format");
      }
    } catch {
      setHostValidationError(t(I18nKey.BACKEND$HOST_INVALID));
      return; // Invalid URL, don't proceed
    }

    if (!isOpenHandsCloudHost(fullHost)) {
      setHostValidationError(t(I18nKey.BACKEND$HOST_INVALID));
      return; // Invalid URL, don't proceed
    }

    // Open popup immediately on user click to avoid popup blocker
    // Start with about:blank and update URL once we have verification URL
    closeAuthPopup();
    processedApiKeyRef.current = null;
    setHostValidationError(null);
    setIsPopupBlocked(false);
    popupRef.current = detachPopupOpener(
      window.open("about:blank", "_blank", "noopener,noreferrer"),
    );

    if (!popupRef.current) {
      // Popup was blocked - flow will still work, user can click manual link
      console.warn("Popup blocked - user will need to use manual link");
      setIsPopupBlocked(true);
    }

    deviceFlow.start(fullHost);
  };

  const handleCancelAuth = () => {
    processedApiKeyRef.current = null;
    deviceFlow.cancel();
    closeAuthPopup();
    setIsPopupBlocked(false);
  };

  return (
    <div
      data-testid={`${testIdRoot}-device-flow`}
      className="flex flex-col gap-3"
    >
      {deviceFlow.status === "idle" && (
        <BrandButton
          type="button"
          variant="primary"
          onClick={handleStartAuth}
          testId={`${testIdRoot}-login-button`}
          className="w-full"
          isDisabled={isDisabled}
        >
          🔑 {t(I18nKey.BACKEND$LOGIN_WITH_OPENHANDS)}
        </BrandButton>
      )}
      {hostValidationError && (
        <p
          className="text-xs text-red-400"
          data-testid={`${testIdRoot}-host-error`}
          role="alert"
        >
          {hostValidationError}
        </p>
      )}

      {deviceFlow.status === "starting" && (
        <div
          className="flex items-center gap-2 p-3 bg-base-tertiary rounded-lg"
          data-testid={`${testIdRoot}-auth-starting`}
          role="status"
          aria-live="polite"
        >
          <LoadingSpinner />
          <span className="text-sm text-[var(--oh-text-tertiary)]">
            {t(I18nKey.BACKEND$AUTH_STARTING)}
          </span>
        </div>
      )}

      {deviceFlow.status === "awaiting_authorization" && (
        <div
          className="flex flex-col gap-3 p-4 bg-base-tertiary rounded-lg"
          data-testid={`${testIdRoot}-auth-awaiting`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <LoadingSpinner />
            <span className="text-sm font-medium text-white">
              {t(I18nKey.BACKEND$AUTH_AWAITING)}
            </span>
          </div>
          <p
            className="text-sm text-[var(--oh-text-tertiary)]"
            role={isPopupBlocked ? "alert" : undefined}
          >
            {isPopupBlocked
              ? t(I18nKey.BACKEND$AUTH_OPEN_MANUALLY)
              : t(I18nKey.BACKEND$AUTH_BROWSER_OPENED)}
          </p>
          {deviceFlow.verificationUrl &&
            isValidVerificationUrl(deviceFlow.verificationUrl) && (
              <div className="text-xs text-[var(--oh-muted)]">
                {!isPopupBlocked && (
                  <p>{t(I18nKey.BACKEND$AUTH_OPEN_MANUALLY)}</p>
                )}
                <a
                  href={deviceFlow.verificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline break-all"
                >
                  {deviceFlow.verificationUrl}
                </a>
              </div>
            )}
          <BrandButton
            type="button"
            variant="secondary"
            onClick={handleCancelAuth}
            testId={`${testIdRoot}-auth-cancel`}
            className="w-full mt-2"
          >
            {t(I18nKey.BACKEND$AUTH_CANCEL)}
          </BrandButton>
        </div>
      )}

      {deviceFlow.status === "error" && (
        <div
          className="flex flex-col gap-3 p-4 bg-red-900/20 border border-red-700 rounded-lg"
          data-testid={`${testIdRoot}-auth-error`}
          role="alert"
        >
          <p className="text-sm text-red-400">{deviceFlow.error}</p>
          <BrandButton
            type="button"
            variant="secondary"
            onClick={handleStartAuth}
            testId={`${testIdRoot}-auth-retry`}
            className="w-full"
          >
            {t(I18nKey.BACKEND$AUTH_RETRY)}
          </BrandButton>
        </div>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
