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

/**
 * Wrapper that pads each step into a 1/N-width column of the slide
 * rail and hides inactive steps from assistive tech / tab order so
 * keyboard users only ever interact with the visible step.
 */
function Slide({
  isActive,
  children,
}: {
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden={!isActive}
      style={{ width: `${100 / TOTAL_STEPS}%` }}
      className={cn("shrink-0 px-1", !isActive && "pointer-events-none")}
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
          "flex flex-col gap-6 rounded-2xl border border-white/10 bg-base-secondary shadow-2xl",
          "w-[560px] max-w-[92vw]",
        )}
      >
        <header className="flex flex-col gap-3 px-7 pt-7">
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
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-white/5 hover:text-white"
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

        <div className="overflow-hidden px-7 pb-7">
          <div
            data-testid="onboarding-slide-rail"
            className="flex transition-transform duration-300 ease-out"
            style={{
              // The rail is `TOTAL_STEPS * 100%` wide; we slide it
              // left by `step * 100%` so the next step animates in
              // from the right.
              transform: `translateX(-${currentStep * 100}%)`,
              width: `${TOTAL_STEPS * 100}%`,
            }}
          >
            <Slide isActive={currentStep === 0}>
              <ChooseAgentStep
                selectedAgentId={selectedAgentId}
                onSelect={setSelectedAgentId}
                onNext={goNext}
              />
            </Slide>
            <Slide isActive={currentStep === 1}>
              <CheckBackendStep onBack={goBack} onNext={goNext} />
            </Slide>
            <Slide isActive={currentStep === 2}>
              <SetupLlmStep onBack={goBack} onNext={goNext} />
            </Slide>
            <Slide isActive={currentStep === 3}>
              <SayHelloStep onBack={goBack} onLaunched={onClose} />
            </Slide>
          </div>
        </div>
      </section>
    </ModalBackdrop>
  );
}
