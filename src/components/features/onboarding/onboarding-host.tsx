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

/**
 * `true` when the active backend reports a Cloud-side LLM that's
 * already set up:
 *   * `agent_settings.llm.model` is a non-empty string, AND
 *   * the backend reports an API key on file OR the model uses
 *     subscription auth (no key required).
 *
 * Only applied to Cloud backends. For Local backends the
 * `llm_api_key_set` flag is not a reliable "user has set this up"
 * signal — the agent-server can be started with an env-injected
 * key (`LLM_API_KEY=…`), which would make every fresh install look
 * configured. Local first-run detection stays driven by the
 * existing `openhands-onboarded` localStorage flag.
 */
function isReturningCloudUser(
  backendKind: "cloud" | "local" | string,
  settings: ReturnType<typeof useSettings>["data"],
): boolean {
  if (backendKind !== "cloud") return false;
  const llm = settings?.agent_settings?.llm as
    | { model?: unknown; auth_type?: unknown }
    | undefined;
  const hasModel = typeof llm?.model === "string" && llm.model.length > 0;
  const isAuthed =
    settings?.llm_api_key_set === true || llm?.auth_type === "subscription";
  return hasModel && isAuthed;
}

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
  const skipForReturningCloudUser = isReturningCloudUser(
    backend.kind,
    settings,
  );

  React.useEffect(() => {
    if (!isPreview && !isCompleted && skipForReturningCloudUser) {
      markCompleted();
    }
  }, [isPreview, isCompleted, skipForReturningCloudUser, markCompleted]);

  if (!isPreview) {
    if (isCompleted) return null;
    if (skipForReturningCloudUser) return null;
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
