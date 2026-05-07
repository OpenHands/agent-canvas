import React from "react";
import { useTranslation } from "react-i18next";
import { useTelemetry } from "#/hooks/use-telemetry";
import { I18nKey } from "#/i18n/declaration";

interface TelemetryConsentBannerProps {
  /** Custom class name for the banner container */
  className?: string;
  /** Called after user makes a choice */
  onChoice?: (granted: boolean) => void;
}

/**
 * A consent banner for telemetry/analytics that appears on first use.
 *
 * This component:
 * - Shows only when consent is pending
 * - Allows users to accept or decline tracking
 * - Respects DO_NOT_TRACK environment variable
 * - Persists choice in localStorage
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <>
 *       <TelemetryConsentBanner />
 *       <MainContent />
 *     </>
 *   );
 * }
 * ```
 */
export function TelemetryConsentBanner({
  className,
  onChoice,
}: TelemetryConsentBannerProps) {
  const { t } = useTranslation("openhands");
  const { showConsentPrompt, grantConsent, denyConsent } = useTelemetry();

  const handleAccept = () => {
    grantConsent();
    onChoice?.(true);
  };

  const handleDecline = () => {
    denyConsent();
    onChoice?.(false);
  };

  if (!showConsentPrompt) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md 
        bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg p-4 z-50 ${className || ""}`}
      role="dialog"
      aria-labelledby="telemetry-consent-title"
      aria-describedby="telemetry-consent-description"
    >
      <h3
        id="telemetry-consent-title"
        className="text-sm font-semibold text-white mb-2"
      >
        {t(I18nKey.TELEMETRY$CONSENT_TITLE, { defaultValue: "Help improve OpenHands" })}
      </h3>
      <p
        id="telemetry-consent-description"
        className="text-xs text-neutral-300 mb-4"
      >
        {t(I18nKey.TELEMETRY$CONSENT_DESCRIPTION, {
          defaultValue:
            "We collect anonymous usage data to improve the product. No personal information is collected. You can change this setting anytime.",
        })}
      </p>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={handleDecline}
          className="px-3 py-1.5 text-xs text-neutral-300 hover:text-white 
            border border-neutral-600 hover:border-neutral-500 rounded transition-colors"
        >
          {t(I18nKey.TELEMETRY$DECLINE, { defaultValue: "Decline" })}
        </button>
        <button
          type="button"
          onClick={handleAccept}
          className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 
            rounded transition-colors"
        >
          {t(I18nKey.TELEMETRY$ACCEPT, { defaultValue: "Accept" })}
        </button>
      </div>
      <p className="text-[10px] text-neutral-500 mt-2">
        {t(I18nKey.TELEMETRY$OPT_OUT_HINT, {
          defaultValue: "Set VITE_DO_NOT_TRACK=1 to disable telemetry globally.",
        })}
      </p>
    </div>
  );
}
