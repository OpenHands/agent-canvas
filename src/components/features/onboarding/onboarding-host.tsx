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
import { SEEDED_DEFAULT_BACKEND_ID } from "#/api/backend-registry/default-backend";
import type { Backend } from "#/api/backend-registry/types";

/**
 * `true` when the active backend already has a ready-to-use LLM:
 *   * `agent_settings.llm.model` is a non-empty string, AND
 *   * the backend reports an API key on file OR the model uses
 *     subscription auth (no key required).
 *
 * Cloud surfaces this via `llm_api_key_set`; the agent-server
 * surfaces it via `llm_api_key_is_set` — we accept either, so the
 * same skip rule applies in both modes. A truly fresh agent-server
 * with no key configured reports both flags as `false` and the
 * modal continues to show.
 *
 * For Local backends the skip is intentionally suppressed for the
 * launcher-seeded default backend (`SEEDED_DEFAULT_BACKEND_ID`). The
 * agent-server can be started with an env-injected LLM key, and in
 * shared-server deployments (e.g. the mock-LLM E2E stack) a
 * previously-configured LLM persists across browser sessions — so
 * keying the first-run onboarding modal off the server's LLM state
 * would suppress onboarding for a genuinely fresh browser install.
 * The skip still fires for Local backends the user explicitly added
 * via "Add Backend" (which carry a different id), preserving the
 * "don't walk a pre-configured server through Set Up LLM" behavior.
 */
function isBackendLlmReady(
  backend: Backend,
  settings: ReturnType<typeof useSettings>["data"],
): boolean {
  const llm = settings?.agent_settings?.llm as
    | { model?: unknown; auth_type?: unknown }
    | undefined;
  const hasModel = typeof llm?.model === "string" && llm.model.length > 0;
  const isAuthed =
    settings?.llm_api_key_set === true ||
    settings?.llm_api_key_is_set === true ||
    llm?.auth_type === "subscription";
  if (!hasModel || !isAuthed) return false;
  if (backend.kind === "local" && backend.id === SEEDED_DEFAULT_BACKEND_ID) {
    return false;
  }
  return true;
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
