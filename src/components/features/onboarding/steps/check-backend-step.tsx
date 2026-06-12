import React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { isNoBackend } from "#/api/backend-registry/active-store";
import {
  getAgentServerFormDefaults,
  isAuthRequired,
} from "#/api/agent-server-config";
import { DEFAULT_LOCAL_BACKEND_NAME } from "#/api/backend-registry/default-backend";
import { BackendForm } from "#/components/features/backends/backend-form-modal";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";
import { I18nKey } from "#/i18n/declaration";
import ChevronDownSmallIcon from "#/icons/chevron-down-small.svg?react";
import { cn } from "#/utils/utils";

interface CheckBackendStepProps {
  onBack?: () => void;
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
  const noBackendSelected = isNoBackend(backend);
  const defaults = React.useMemo(() => getAgentServerFormDefaults(), []);
  const backendForForm = noBackendSelected
    ? {
        id: "onboarding-local-backend-draft",
        name: DEFAULT_LOCAL_BACKEND_NAME,
        host: defaults.baseUrl,
        apiKey: defaults.sessionApiKey,
        kind: "local" as const,
      }
    : backend;
  const healthByBackendId = useBackendsHealth(
    noBackendSelected ? [] : [backend],
  );
  const isConnected = noBackendSelected
    ? false
    : (healthByBackendId[backend.id]?.isConnected ?? null);
  const [configurationOpen, setConfigurationOpen] = React.useState(false);

  React.useEffect(() => {
    if (isConnected === true) {
      setConfigurationOpen(false);
    }
  }, [isConnected]);

  const hideConfigurationFields = isConnected === true && !configurationOpen;

  return (
    <div
      data-testid="onboarding-step-check-backend"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-medium text-white">
          {t(I18nKey.ONBOARDING$BACKEND_TITLE)}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.ONBOARDING$BACKEND_SUBTITLE)}
        </p>
      </header>

      <ConnectionBanner isConnected={isConnected} />

      {isConnected === true ? (
        <button
          type="button"
          onClick={() => setConfigurationOpen((open) => !open)}
          aria-expanded={configurationOpen}
          data-testid="onboarding-backend-show-configuration"
          className="flex w-full cursor-pointer items-center justify-center gap-1 text-center text-xs text-[var(--oh-muted)] transition-colors hover:text-content-2"
        >
          <span>
            {configurationOpen
              ? t(I18nKey.ONBOARDING$BACKEND_HIDE_CONFIGURATION)
              : t(I18nKey.ONBOARDING$BACKEND_SHOW_CONFIGURATION)}
          </span>
          <ChevronDownSmallIcon
            className={cn(
              "h-4 w-4 shrink-0 text-muted transition-transform",
              configurationOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      ) : null}

      <BackendForm
        mode={noBackendSelected ? "add" : "edit"}
        backend={backendForForm}
        onSubmitted={onNext}
        testIdRoot="onboarding-backend"
        requireApiKey={isAuthRequired()}
        hideConfigurationFields={hideConfigurationFields}
        renderActions={({ canSubmit, isSubmitting }) => (
          <div
            className={cn(
              "sticky bottom-0 mt-2 flex items-center gap-2 bg-base-secondary pt-4 pb-7",
              onBack ? "justify-between" : "justify-end",
            )}
          >
            {onBack ? (
              <BrandButton
                testId="onboarding-backend-back"
                type="button"
                variant="secondary"
                onClick={onBack}
                isDisabled={isSubmitting}
              >
                {t(I18nKey.ONBOARDING$BACK)}
              </BrandButton>
            ) : null}
            <BrandButton
              testId="onboarding-backend-next"
              type="submit"
              variant="primary"
              isDisabled={!canSubmit || isSubmitting}
            >
              {isSubmitting
                ? t(I18nKey.SETTINGS$SAVING)
                : t(I18nKey.ONBOARDING$NEXT)}
            </BrandButton>
          </div>
        )}
      />
    </div>
  );
}
