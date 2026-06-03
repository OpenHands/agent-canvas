import React from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { OnboardingProgressBar } from "./onboarding-progress-bar";
import {
  ChooseAgentStep,
  type OnboardingAgentId,
} from "./steps/choose-agent-step";
import { CheckBackendStep } from "./steps/check-backend-step";
import { SetupLlmStep } from "./steps/setup-llm-step";
import { SetupAcpSecretsStep } from "./steps/setup-acp-secrets-step";
import { SayHelloStep } from "./steps/say-hello-step";

const TOTAL_STEPS = 4;

// Index of the per-provider setup slide (LLM form for OpenHands, ACP
// credentials for Claude Code / Codex). Named so the slide and the
// ``isActive`` gate that drives the ACP login probe move together — inserting
// a slide before it can't silently fire the probe on the wrong step.
const SETUP_SLIDE_INDEX = 2;

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
}

/**
 * Top-level onboarding modal for first-time users.
 *
 * The flow is a fixed sequence of four steps:
 *   0. Check backend
 *   1. Choose agent
 *   2. Set up LLM
 *   3. Say hello (creates a fresh conversation, then closes)
 *
 * Each step lives in its own slide; all four are mounted at once and
 * the rail is translated horizontally by step index, so transitioning
 * between steps animates the new step in from the right.
 */
export function OnboardingModal({ onClose }: OnboardingModalProps) {
  const { t } = useTranslation("openhands");
  const [currentStep, setCurrentStep] = React.useState(0);
  const [selectedAgentId, setSelectedAgentId] =
    React.useState<OnboardingAgentId>("openhands");

  // Slide index 2 is the "provider credentials" slot:
  //   * OpenHands → the LLM-setup form (its own LLM config).
  //   * Any ACP provider (Claude Code / Codex / Gemini) → the ACP credentials
  //     form: API key + optional base URL, with a login-detection banner.
  const isOpenHands = selectedAgentId === "openhands";
  const goNext = React.useCallback(
    () => setCurrentStep((step) => Math.min(step + 1, TOTAL_STEPS - 1)),
    [],
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
              totalSteps={TOTAL_STEPS}
            />
          </header>

          <div
            data-testid="onboarding-scroll-area"
            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-always px-7"
          >
            <div
              data-testid="onboarding-slide-rail"
              data-current-step={currentStep}
              className="relative overflow-clip"
            >
              <Slide index={0} currentStep={currentStep}>
                <CheckBackendStep onNext={goNext} />
              </Slide>
              <Slide index={1} currentStep={currentStep}>
                <ChooseAgentStep
                  selectedAgentId={selectedAgentId}
                  onSelect={setSelectedAgentId}
                  onNext={goNext}
                  onBack={goBack}
                />
              </Slide>
              <Slide index={SETUP_SLIDE_INDEX} currentStep={currentStep}>
                {isOpenHands ? (
                  <SetupLlmStep onBack={goBack} onNext={goNext} />
                ) : (
                  <SetupAcpSecretsStep
                    providerKey={selectedAgentId}
                    isActive={currentStep === SETUP_SLIDE_INDEX}
                    onBack={goBack}
                    onNext={goNext}
                  />
                )}
              </Slide>
              <Slide index={3} currentStep={currentStep}>
                <SayHelloStep onBack={goBack} onLaunched={onClose} />
              </Slide>
            </div>
          </div>
        </section>

        <button
          type="button"
          data-testid="onboarding-skip"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm text-[var(--oh-muted)] transition-colors hover:bg-white/5 hover:text-white cursor-pointer"
        >
          {t(I18nKey.ONBOARDING$SKIP)}
        </button>
      </div>
    </ModalBackdrop>
  );
}
