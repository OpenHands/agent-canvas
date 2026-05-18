import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTelemetry } from "#/hooks/use-telemetry";
import { I18nKey } from "#/i18n/declaration";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import {
  BaseModalTitle,
  BaseModalDescription,
} from "#/components/shared/modals/confirmation-modals/base-modal";
import { BrandButton } from "#/components/features/settings/brand-button";

interface TelemetryConsentBannerProps {
  /** Called after user makes a choice */
  onChoice?: (granted: boolean) => void;
}

/**
 * A consent modal for telemetry/analytics that appears on first use.
 *
 * This component:
 * - Shows as a full-screen modal overlay when consent is pending
 * - Waits for translations to load before displaying (prevents key flashing)
 * - Allows users to accept or decline tracking via checkbox
 * - Respects DO_NOT_TRACK environment variable
 * - Persists choice in localStorage
 * - Styled to match the OpenHands analytics consent modal
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
  onChoice,
}: TelemetryConsentBannerProps) {
  const { t, ready } = useTranslation("openhands");
  const { showConsentPrompt, grantConsent, denyConsent } = useTelemetry();

  // Delay showing the modal slightly to ensure smooth rendering
  // This prevents the modal from flashing during initial hydration
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    if (ready && showConsentPrompt) {
      // Small delay to ensure DOM is fully hydrated and translations loaded
      const timer = setTimeout(() => setIsReady(true), 50);
      return () => clearTimeout(timer);
    }
    setIsReady(false);
    return undefined;
  }, [ready, showConsentPrompt]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const analytics = formData.get("analytics") === "on";

    if (analytics) {
      grantConsent();
    } else {
      denyConsent();
    }
    onChoice?.(analytics);
  };

  // Don't render until translations are ready and component has stabilized
  if (!isReady) {
    return null;
  }

  return (
    <ModalBackdrop aria-label={t(I18nKey.TELEMETRY$CONSENT_TITLE)}>
      <form
        data-testid="telemetry-consent-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-2"
      >
        <ModalBody className="border border-[var(--oh-border)]">
          <BaseModalTitle title={t(I18nKey.TELEMETRY$CONSENT_TITLE)} />
          <BaseModalDescription>
            {t(I18nKey.TELEMETRY$CONSENT_DESCRIPTION)}
          </BaseModalDescription>

          <label className="flex gap-2 items-center self-start text-sm cursor-pointer">
            <input
              name="analytics"
              type="checkbox"
              defaultChecked
              className="w-4 h-4 cursor-pointer"
            />
            {t(I18nKey.TELEMETRY$SEND_ANONYMOUS_DATA)}
          </label>

          <BrandButton
            testId="confirm-telemetry-preferences"
            type="submit"
            variant="primary"
            className="w-full"
          >
            {t(I18nKey.TELEMETRY$CONFIRM_PREFERENCES)}
          </BrandButton>
        </ModalBody>
      </form>
    </ModalBackdrop>
  );
}
