import React from "react";
import { useLocation } from "react-router";
import { OnboardingModal } from "./onboarding-modal";
import {
  isOnboardingPreviewActive,
  readOnboardingPreviewStep,
} from "./onboarding-preview";
import { useOnboardingCompletion } from "./use-onboarding-completion";
import { useSettings } from "#/hooks/query/use-settings";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { isBackendLlmReady } from "./is-backend-llm-ready";

/**
 * Mounts the onboarding modal automatically the first time the user
 * lands on a host route (i.e. when the localStorage onboarding flag
 * isn't set yet). Closing or completing the flow marks it done so the
 * modal won't re-appear on subsequent visits.
 *
 * Returning Cloud users are detected via the live settings query: if
 * Cloud already reports a configured LLM (api key + model, or a
 * subscription model with no key), onboarding is skipped and the
 * completion flag is persisted so the same user keeps skipping across
 * tabs and devices.
 *
 * Local backends fall through to the existing localStorage-based
 * gating — env-injected keys make the settings-based signal unreliable
 * there.
 *
 * Stale or unreachable backends fall through to the modal so the
 * existing backend-check / manage-backends recovery path still kicks
 * in for those users.
 *
 * With `?previewOnboardingStep=<0-3>` the modal opens on that slide for
 * design review without persisting completion (works on any route when
 * mounted from the root layout).
 */
export function OnboardingHost() {
  const location = useLocation();
  const previewStep = readOnboardingPreviewStep(location.search);
  const isPreview = isOnboardingPreviewActive(location.search);
  const { isCompleted, markCompleted } = useOnboardingCompletion();
  const { backend } = useActiveBackend();
  const { data: settings } = useSettings();
  const skipForReadyBackend = isBackendLlmReady(backend, settings);

  React.useEffect(() => {
    if (!isPreview && !isCompleted && skipForReadyBackend) {
      markCompleted();
    }
  }, [isPreview, isCompleted, skipForReadyBackend, markCompleted]);

  if (!isPreview) {
    if (isCompleted) return null;
    if (skipForReadyBackend) return null;
  }

  const handleClose = () => {
    if (isPreview) return;
    markCompleted();
  };

  return (
    <OnboardingModal
      onClose={handleClose}
      initialStep={previewStep ?? 0}
      isPreview={isPreview}
    />
  );
}
