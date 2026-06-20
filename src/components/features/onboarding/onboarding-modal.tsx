import React from "react";
import { useTranslation } from "react-i18next";
import { isNoBackend } from "#/api/backend-registry/active-store";
import { getLockedCloudHost } from "#/api/agent-server-config";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";
import { OnboardingProgressBar } from "./onboarding-progress-bar";
import {
  ChooseAgentStep,
  type OnboardingAgentId,
} from "./steps/choose-agent-step";
import { CheckBackendStep } from "./steps/check-backend-step";
import { SetupLlmStep } from "./steps/setup-llm-step";
import { SetupAcpSecretsStep } from "./steps/setup-acp-secrets-step";
import { SayHelloStep } from "./steps/say-hello-step";

const TOTAL_STEPS_WITH_BACKEND = 4;
const TOTAL_STEPS_WITHOUT_BACKEND = 3;

interface SlideProps {
  /** Index of this slide in the step sequence. */
  index: number;
  /** Index of the currently visible step. */
  currentStep: number;
  children: React.ReactNode;
}

/**
 * One step panel inside the slide rail.
 *
 * Only the active slide is in normal flow — it drives the surrounding
 * container's height. Inactive slides are absolutely positioned so
 * they don't add their height to the modal box (which previously made
 * the modal "overhang" with empty space sized to the tallest step).
 *
 * Each slide is translated horizontally by `(index - currentStep) *
 * 100%` so the active step sits at offset 0, with prior steps off to
 * the left and upcoming steps off to the right. Changes to
 * `currentStep` smoothly animate the transform.
 */
function Slide({ index, currentStep, children }: SlideProps) {
  const isActive = index === currentStep;
  const offsetPct = (index - currentStep) * 100;
  return (
    <div
      data-testid={`onboarding-slide-${index}`}
      data-active={isActive}
      aria-hidden={!isActive}
      // slide offset computed from step index at runtime
      style={{ transform: `translateX(${offsetPct}%)` }}
      className={cn(
        "w-full transition-transform duration-300 ease-out",
        // Inactive slides are taken out of flow so the rail's height
        // tracks just the active step; they stay overlaid via inset-0
        // so they slide in/out of view across the same horizontal box.
        !isActive && "pointer-events-none absolute inset-0",
      )}
    >
      {children}
    </div>
  );
}

interface OnboardingModalProps {
  /** Called when the user dismisses the modal (skip / X / launch). */
  onClose: () => void;
  /** Optional slide index for dev preview (`?previewOnboardingStep=`). */
  initialStep?: number;
  /** When true, skip/close does not persist onboarding completion. */
  isPreview?: boolean;
}

/**
 * Top-level onboarding modal for first-time users.
 *
 * The flow starts with backend setup only when the active backend is missing
 * or cannot be reached. If an already configured backend is healthy, the user
 * starts directly on agent selection:
 *   0. Check/add backend (only when needed)
 *   1. Choose agent
 *   2. Set up LLM
 *   3. Say hello (creates a fresh conversation, then closes)
 *
 * Each visible step lives in its own slide and the rail is translated
 * horizontally by step index, so transitioning between steps animates the new
 * step in from the right.
 */
export function OnboardingModal({
  onClose,
  initialStep = 0,
  isPreview = false,
}: OnboardingModalProps) {
  const { t } = useTranslation("openhands");
  const { active } = useActiveBackendContext();
  const { backend } = active;
  const noBackendSelected = isNoBackend(backend);
  const healthByBackendId = useBackendsHealth(
    noBackendSelected ? [] : [backend],
  );
  const skipBackendStep =
    !noBackendSelected && healthByBackendId[backend.id]?.isConnected === true;
  const totalSteps = skipBackendStep
    ? TOTAL_STEPS_WITHOUT_BACKEND
    : TOTAL_STEPS_WITH_BACKEND;
  const agentStepIndex = skipBackendStep ? 0 : 1;
  const setupStepIndex = skipBackendStep ? 1 : 2;
  const helloStepIndex = skipBackendStep ? 2 : 3;
  const [currentStep, setCurrentStep] = React.useState(() =>
    Math.min(Math.max(initialStep, 0), TOTAL_STEPS_WITH_BACKEND - 1),
  );
  const [selectedAgentId, setSelectedAgentId] =
    React.useState<OnboardingAgentId>("openhands");

  const wasSkippingBackendStep = React.useRef(skipBackendStep);

  React.useEffect(() => {
    if (!wasSkippingBackendStep.current && skipBackendStep) {
      setCurrentStep((step) => Math.max(step - 1, 0));
    }
    wasSkippingBackendStep.current = skipBackendStep;
  }, [skipBackendStep]);

  React.useEffect(() => {
    setCurrentStep((step) => Math.min(step, totalSteps - 1));
  }, [totalSteps]);

  // The setup slide is the "provider credentials" slot:
  //   * OpenHands → the LLM-setup form (its own LLM config).
  //   * Any ACP provider (Claude Code / Codex / Gemini) → the ACP credentials
  //     form: API key + optional base URL, with a login-detection banner.
  const isOpenHands = selectedAgentId === "openhands";
  const hideSkip = currentStep === 0 && getLockedCloudHost() !== null;
  const goNext = React.useCallback(
    () => setCurrentStep((step) => Math.min(step + 1, totalSteps - 1)),
    [totalSteps],
  );
  const goBack = React.useCallback(
    () => setCurrentStep((step) => Math.max(step - 1, 0)),
    [],
  );

  return (
    // No `onClose`: the flow must only be dismissed via explicit actions
    // (the skip button or launching), never by an errant backdrop click or
    // Escape press — see https://github.com/OpenHands/agent-canvas/issues/1085.
    <ModalBackdrop aria-label={t(I18nKey.ONBOARDING$TITLE)}>
      <div className="relative flex flex-col items-center gap-4">
        <section
          data-testid="onboarding-modal"
          data-current-step={currentStep}
          data-preview={isPreview ? "true" : undefined}
          className={cn(
            "flex flex-col gap-6 overflow-hidden rounded-2xl border border-white/10 bg-base-secondary shadow-2xl",
            modalWidthClassName("lg"),
            MODAL_MAX_WIDTH_VIEWPORT,
            "max-h-[90vh]",
          )}
        >
          <header className="flex flex-col gap-3 px-7 pt-7 shrink-0">
            <OnboardingProgressBar
              currentStep={currentStep}
              totalSteps={totalSteps}
            />
          </header>

          <div
            data-testid="onboarding-scroll-area"
            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-always px-7 pb-7"
          >
            <div
              data-testid="onboarding-slide-rail"
              data-current-step={currentStep}
              className="relative overflow-clip"
            >
              {skipBackendStep ? null : (
                <Slide index={0} currentStep={currentStep}>
                  <CheckBackendStep onNext={goNext} />
                </Slide>
              )}
              <Slide index={agentStepIndex} currentStep={currentStep}>
                <ChooseAgentStep
                  selectedAgentId={selectedAgentId}
                  onSelect={setSelectedAgentId}
                  onBack={skipBackendStep ? undefined : goBack}
                  onNext={goNext}
                />
              </Slide>
              <Slide index={setupStepIndex} currentStep={currentStep}>
                {isOpenHands ? (
                  <SetupLlmStep onBack={goBack} onNext={goNext} />
                ) : (
                  <SetupAcpSecretsStep
                    providerKey={selectedAgentId}
                    isActive={currentStep === setupStepIndex}
                    onBack={goBack}
                    onNext={goNext}
                  />
                )}
              </Slide>
              <Slide index={helloStepIndex} currentStep={currentStep}>
                <SayHelloStep
                  onBack={goBack}
                  onClose={onClose}
                  onLaunched={onClose}
                />
              </Slide>
            </div>
          </div>
        </section>

        {currentStep < totalSteps - 1 && !hideSkip ? (
          <button
            type="button"
            data-testid="onboarding-skip"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-[var(--oh-muted)] transition-colors hover:bg-white/5 hover:text-white cursor-pointer"
          >
            {t(I18nKey.ONBOARDING$SKIP)}
          </button>
        ) : null}
      </div>
    </ModalBackdrop>
  );
}
