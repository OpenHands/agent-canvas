import React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { BackendForm } from "#/components/features/backends/backend-form-modal";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

interface CheckBackendStepProps {
  onBack: () => void;
  onNext: () => void;
}

function ConnectionBanner({ isConnected }: { isConnected: boolean | null }) {
  const { t } = useTranslation("openhands");

  if (isConnected === true) {
    return (
      <div
        role="status"
        data-testid="onboarding-backend-connected"
        className={cn(
          "flex items-start gap-3 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3",
        )}
      >
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-400" />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-green-200">
            {t(I18nKey.ONBOARDING$BACKEND_CONNECTED_TITLE)}
          </span>
          <span className="text-xs text-green-200/80">
            {t(I18nKey.ONBOARDING$BACKEND_CONNECTED_BODY)}
          </span>
        </div>
      </div>
    );
  }

  if (isConnected === false) {
    return (
      <div
        role="alert"
        data-testid="onboarding-backend-disconnected"
        className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3"
      >
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-400" />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-red-200">
            {t(I18nKey.ONBOARDING$BACKEND_DISCONNECTED_TITLE)}
          </span>
          <span className="text-xs text-red-200/80">
            {t(I18nKey.ONBOARDING$BACKEND_DISCONNECTED_BODY)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="onboarding-backend-checking"
      className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
    >
      <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--oh-text-tertiary)]" />
      <span className="text-sm text-[var(--oh-text-tertiary)]">
        {t(I18nKey.ONBOARDING$BACKEND_CHECKING)}
      </span>
    </div>
  );
}

/**
 * Step 1: embed the "edit backend" form pre-populated with the
 * default/active backend, plus a contextual success/error banner that
 * reacts to the live health probe.
 */
export function CheckBackendStep({ onBack, onNext }: CheckBackendStepProps) {
  const { t } = useTranslation("openhands");
  const { active } = useActiveBackendContext();
  const { backend } = active;
  const healthByBackendId = useBackendsHealth([backend]);
  const isConnected = healthByBackendId[backend.id]?.isConnected ?? null;

  return (
    <div
      data-testid="onboarding-step-check-backend"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-white">
          {t(I18nKey.ONBOARDING$BACKEND_TITLE)}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.ONBOARDING$BACKEND_SUBTITLE)}
        </p>
      </header>

      <ConnectionBanner isConnected={isConnected} />

      <BackendForm
        mode="edit"
        backend={backend}
        onSubmitted={() => {}}
        testIdRoot="onboarding-backend"
        renderActions={({ canSubmit, testIdRoot }) => (
          <div className="sticky bottom-0 flex items-center justify-between gap-2 mt-2 bg-base-secondary pt-4 pb-7">
            <BrandButton
              testId="onboarding-backend-back"
              type="button"
              variant="secondary"
              onClick={onBack}
            >
              {t(I18nKey.ONBOARDING$BACK)}
            </BrandButton>
            <div className="flex gap-2">
              <BrandButton
                testId={`${testIdRoot}-submit`}
                type="submit"
                variant="secondary"
                isDisabled={!canSubmit}
              >
                {t(I18nKey.BACKEND$SAVE)}
              </BrandButton>
              <BrandButton
                testId="onboarding-backend-next"
                type="button"
                variant="primary"
                isDisabled={isConnected !== true}
                onClick={onNext}
              >
                {t(I18nKey.ONBOARDING$NEXT)}
              </BrandButton>
            </div>
          </div>
        )}
      />
    </div>
  );
}
