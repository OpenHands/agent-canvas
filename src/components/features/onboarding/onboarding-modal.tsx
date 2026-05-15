import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { OnboardingProgressBar } from "./onboarding-progress-bar";
import {
  ChooseAgentStep,
  type OnboardingAgentId,
} from "./steps/choose-agent-step";
import { CheckBackendStep } from "./steps/check-backend-step";
import { SetupLlmStep } from "./steps/setup-llm-step";
import { SayHelloStep } from "./steps/say-hello-step";

const TOTAL_STEPS = 4;

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
 *   0. Choose agent
 *   1. Check backend
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

  const goNext = React.useCallback(
    () => setCurrentStep((step) => (step >= TOTAL_STEPS - 1 ? step : step + 1)),
    [],
  );
  const goBack = React.useCallback(
    () => setCurrentStep((step) => (step <= 0 ? 0 : step - 1)),
    [],
  );

  return (
    <ModalBackdrop
      onClose={onClose}
      closeOnEscape={false}
      aria-label={t(I18nKey.ONBOARDING$TITLE)}
    >
      <section
        data-testid="onboarding-modal"
        data-current-step={currentStep}
        className={cn(
          "flex flex-col gap-6 overflow-hidden rounded-2xl border border-white/10 bg-base-secondary shadow-2xl",
          "w-[560px] max-w-[92vw] max-h-[90vh]",
        )}
      >
        <header className="flex flex-col gap-3 px-7 pt-7 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-400">
              {t(I18nKey.ONBOARDING$STEP_LABEL, {
                current: currentStep + 1,
                total: TOTAL_STEPS,
              })}
            </p>
            <button
              type="button"
              data-testid="onboarding-skip"
              onClick={onClose}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 cursor-pointer hover:bg-white/5 hover:text-white"
            >
              <span>{t(I18nKey.ONBOARDING$SKIP)}</span>
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
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
              <ChooseAgentStep
                selectedAgentId={selectedAgentId}
                onSelect={setSelectedAgentId}
                onNext={goNext}
              />
            </Slide>
            <Slide index={1} currentStep={currentStep}>
              <CheckBackendStep onBack={goBack} onNext={goNext} />
            </Slide>
            <Slide index={2} currentStep={currentStep}>
              <SetupLlmStep onBack={goBack} onNext={goNext} />
            </Slide>
            <Slide index={3} currentStep={currentStep}>
              <SayHelloStep onBack={goBack} onLaunched={onClose} />
            </Slide>
          </div>
        </div>
      </section>
    </ModalBackdrop>
  );
}
