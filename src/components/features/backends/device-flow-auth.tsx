import React from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useDeviceFlow } from "#/hooks/use-device-flow";
import { I18nKey } from "#/i18n/declaration";

interface DeviceFlowAuthProps {
  /** The host URL for the cloud backend */
  host: string;
  /** Callback when authentication succeeds with the API key */
  onSuccess: (apiKey: string) => void;
  /** Test ID prefix for the component */
  testIdRoot: string;
}

/**
 * Device Flow authentication UI component.
 *
 * Shows a "Login with OpenHands" button that initiates OAuth 2.0 Device Flow
 * authentication. Displays status during the auth process and auto-opens
 * the browser for user authorization.
 */
export function DeviceFlowAuth({
  host,
  onSuccess,
  testIdRoot,
}: DeviceFlowAuthProps) {
  const { t } = useTranslation("openhands");
  const deviceFlow = useDeviceFlow();
  const browserOpenedRef = React.useRef(false);

  // Open browser when we transition to awaiting_authorization
  React.useEffect(() => {
    if (
      deviceFlow.status === "awaiting_authorization" &&
      deviceFlow.verificationUrl &&
      !browserOpenedRef.current
    ) {
      browserOpenedRef.current = true;
      window.open(deviceFlow.verificationUrl, "_blank", "noopener,noreferrer");
    }
  }, [deviceFlow.status, deviceFlow.verificationUrl]);

  // Reset browser opened flag when starting a new flow
  React.useEffect(() => {
    if (deviceFlow.status === "starting") {
      browserOpenedRef.current = false;
    }
  }, [deviceFlow.status]);

  // Call onSuccess when authentication completes
  React.useEffect(() => {
    if (deviceFlow.status === "success" && deviceFlow.apiKey) {
      onSuccess(deviceFlow.apiKey);
      deviceFlow.reset();
    }
  }, [deviceFlow.status, deviceFlow.apiKey, onSuccess, deviceFlow]);

  const handleStartAuth = () => {
    // Normalize the host URL
    const normalizedHost = host.trim().replace(/\/+$/, "");
    const fullHost = /^https?:\/\//i.test(normalizedHost)
      ? normalizedHost
      : `https://${normalizedHost}`;
    deviceFlow.start(fullHost);
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
        >
          🔑 {t(I18nKey.BACKEND$LOGIN_WITH_OPENHANDS)}
        </BrandButton>
      )}

      {deviceFlow.status === "starting" && (
        <div
          className="flex items-center gap-2 p-3 bg-base-tertiary rounded-lg"
          data-testid={`${testIdRoot}-auth-starting`}
        >
          <LoadingSpinner />
          <span className="text-sm text-gray-300">
            {t(I18nKey.BACKEND$AUTH_STARTING)}
          </span>
        </div>
      )}

      {deviceFlow.status === "awaiting_authorization" && (
        <div
          className="flex flex-col gap-3 p-4 bg-base-tertiary rounded-lg"
          data-testid={`${testIdRoot}-auth-awaiting`}
        >
          <div className="flex items-center gap-2">
            <LoadingSpinner />
            <span className="text-sm font-medium text-white">
              {t(I18nKey.BACKEND$AUTH_AWAITING)}
            </span>
          </div>
          <p className="text-sm text-gray-300">
            {t(I18nKey.BACKEND$AUTH_BROWSER_OPENED)}
          </p>
          {deviceFlow.verificationUrl && (
            <div className="text-xs text-gray-400">
              <p>{t(I18nKey.BACKEND$AUTH_OPEN_MANUALLY)}</p>
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
            onClick={deviceFlow.cancel}
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

      {deviceFlow.status !== "idle" && deviceFlow.status !== "success" && (
        <div className="flex items-center gap-2">
          <div className="flex-1 border-t border-gray-600" />
          <span className="text-xs text-gray-500">
            {t(I18nKey.BACKEND$LOGIN_OR_MANUAL)}
          </span>
          <div className="flex-1 border-t border-gray-600" />
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
