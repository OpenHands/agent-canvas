import { type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Cloud, Laptop } from "lucide-react";
import OpenHandsLogo from "#/assets/branding/openhands-logo.svg?react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { formControlButtonClassName } from "#/utils/form-control-classes";
import {
  OPENHANDS_CLOUD_INTEGRATIONS_URL,
  OPENHANDS_SELF_HOSTED_DOCS_URL,
} from "#/utils/constants";
import { useAutomationPreferencesStore } from "#/stores/automation-preferences-store";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

interface DeploymentChoiceModalProps {
  /** Proceed with the existing local automation setup flow. */
  onContinueLocal: () => void;
  /** Dismiss the modal without launching (also called after the cloud link). */
  onClose: () => void;
}

const CHOICE_CARD_CLASSNAME =
  "flex flex-1 flex-col gap-3 rounded-xl border border-[var(--oh-border)] p-4";

/** Inline docs link used inside the {@link Trans} description. */
function SelfHostDocsLink({ children }: { children?: ReactNode }) {
  return (
    <a
      href={OPENHANDS_SELF_HOSTED_DOCS_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="deployment-choice-description-self-hosted"
      className="text-white hover:opacity-80"
    >
      {children}
    </a>
  );
}

/**
 * Explains the two runtime options for an event-driven GitHub / Slack
 * "responder" automation before the user invests time configuring it:
 *
 *  - Poll locally: keeps everything on the user's machine, but only runs while
 *    the laptop is awake and Agent Canvas is running.
 *  - OpenHands Cloud: keeps responding even when the laptop is closed.
 *
 * Today this is only surfaced for the **local** backend (the recommended
 * automations launcher is local-only). The component is intentionally generic
 * so the future Local / User Cloud / OpenHands Cloud switch (issue #868) can
 * reuse it without re-templating the copy.
 */
export function DeploymentChoiceModal({
  onContinueLocal,
  onClose,
}: DeploymentChoiceModalProps) {
  const { t } = useTranslation("openhands");
  const hideResponderDeploymentChoice = useAutomationPreferencesStore(
    (state) => state.hideResponderDeploymentChoice,
  );
  const setHideResponderDeploymentChoice = useAutomationPreferencesStore(
    (state) => state.setHideResponderDeploymentChoice,
  );

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.DEPLOYMENT_CHOICE$TITLE)}
    >
      <div
        data-testid="deployment-choice-modal"
        className={cn(
          "relative rounded-xl border border-[var(--oh-border)] bg-base-secondary",
          modalWidthClassName("xl"),
          MODAL_MAX_WIDTH_VIEWPORT,
        )}
      >
        <ModalCloseButton
          onClose={onClose}
          testId="deployment-choice-modal-close"
        />

        <header className="px-6 pb-2 pr-12 pt-6">
          <h2
            id="deployment-choice-modal-title"
            className="text-lg font-medium text-white"
          >
            {t(I18nKey.DEPLOYMENT_CHOICE$TITLE)}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-tertiary-light">
            <Trans
              ns="openhands"
              i18nKey={I18nKey.DEPLOYMENT_CHOICE$DESCRIPTION}
              components={{ docs: <SelfHostDocsLink /> }}
            />
          </p>
        </header>

        <div className="flex flex-col gap-4 px-6 pb-6 pt-2 sm:flex-row">
          {/* Left: poll locally */}
          <div className={CHOICE_CARD_CLASSNAME}>
            <div className="flex items-center gap-2 text-white">
              <Laptop size={18} className="shrink-0" />
              <h3 className="text-sm font-medium">
                {t(I18nKey.DEPLOYMENT_CHOICE$LOCAL_TITLE)}
              </h3>
            </div>
            <p className="flex-1 text-xs leading-relaxed text-tertiary-light">
              {t(I18nKey.DEPLOYMENT_CHOICE$LOCAL_DESCRIPTION)}
            </p>
            <BrandButton
              type="button"
              variant="secondary"
              testId="deployment-choice-local"
              className="w-full"
              onClick={onContinueLocal}
            >
              {t(I18nKey.DEPLOYMENT_CHOICE$LOCAL_ACTION)}
            </BrandButton>
          </div>

          {/* Right: OpenHands Cloud */}
          <div className={CHOICE_CARD_CLASSNAME}>
            <div className="flex items-center gap-2 text-white">
              <Cloud size={18} className="shrink-0" />
              <h3 className="text-sm font-medium">
                {t(I18nKey.DEPLOYMENT_CHOICE$CLOUD_TITLE)}
              </h3>
            </div>
            <p className="flex-1 text-xs leading-relaxed text-tertiary-light">
              {t(I18nKey.DEPLOYMENT_CHOICE$CLOUD_DESCRIPTION)}
            </p>
            <a
              href={OPENHANDS_CLOUD_INTEGRATIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="deployment-choice-cloud"
              onClick={onClose}
              className={cn(
                formControlButtonClassName,
                "w-full bg-white text-[#0d0f11] hover:opacity-90",
              )}
            >
              <OpenHandsLogo
                width={22}
                height={15}
                className="shrink-0 invert"
                aria-hidden
              />
              {t(I18nKey.DEPLOYMENT_CHOICE$CLOUD_ACTION)}
            </a>
          </div>
        </div>

        <footer className="flex items-center border-t border-[var(--oh-border)] px-6 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-tertiary-light">
            <input
              type="checkbox"
              data-testid="deployment-choice-dont-show-again"
              checked={hideResponderDeploymentChoice}
              onChange={(event) =>
                setHideResponderDeploymentChoice(event.target.checked)
              }
            />
            {t(I18nKey.DEPLOYMENT_CHOICE$DONT_SHOW_AGAIN)}
          </label>
        </footer>
      </div>
    </ModalBackdrop>
  );
}
