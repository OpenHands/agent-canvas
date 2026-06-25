import { SEEDED_DEFAULT_BACKEND_ID } from "#/api/backend-registry/default-backend";
import type { Backend } from "#/api/backend-registry/types";
import type { Settings } from "#/types/settings";

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
 *
 * Extracted into its own module (no UI imports) so `root.tsx` can
 * reuse the exact same rule for its first-run gate without pulling
 * the onboarding modal graph into the root's eager bundle.
 */
export function isBackendLlmReady(
  backend: Backend,
  settings: Settings | undefined,
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
