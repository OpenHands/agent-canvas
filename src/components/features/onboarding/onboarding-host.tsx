import React from "react";
import { OnboardingModal } from "./onboarding-modal";
import { useOnboardingCompletion } from "./use-onboarding-completion";

/**
 * Mounts the onboarding modal automatically the first time the user
 * lands on a host route (i.e. when the localStorage onboarding flag
 * isn't set yet). Closing or completing the flow marks it done so the
 * modal won't re-appear on subsequent visits.
 *
 * Renders nothing once onboarding has been completed.
 */
export function OnboardingHost() {
  const { isCompleted, markCompleted } = useOnboardingCompletion();

  if (isCompleted) return null;

  return <OnboardingModal onClose={markCompleted} />;
}
