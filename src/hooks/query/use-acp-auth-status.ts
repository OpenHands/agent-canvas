import { useQuery } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { getAcpProviderSecrets } from "#/constants/acp-providers";

export type AcpAuthStatus = "authenticated" | "unauthenticated" | "unknown";

/**
 * Probe whether the selected ACP provider's CLI is already authenticated on
 * the agent-server — by a subscription login (Claude Pro/Max, ChatGPT, Google)
 * or a pre-set API key — by creating a **throwaway ACP conversation** and
 * immediately deleting it.
 *
 * The agent-server runs the ACP ``initialize`` + ``session/new`` handshake at
 * conversation start (no prompt is sent, so no model tokens are spent). That
 * handshake only succeeds when the provider CLI can authenticate, so:
 *   - create succeeds → **authenticated** (then we tear the conversation down,
 *     killing the ACP subprocess), and
 *   - create fails for any reason → **unauthenticated** (we never falsely claim
 *     "logged in"; the worst case is showing the API-key fields when they
 *     weren't strictly needed).
 *
 * This is the canvas-only "Phase 0" detection from issue #964 — it reuses the
 * existing conversation endpoints rather than a dedicated auth-status endpoint,
 * so it ships without an SDK release. It lives behind this hook precisely so
 * Phase 1 can swap the body for ``GET /acp/auth-status`` without touching the
 * UI that consumes it.
 */
async function probeAcpAuth(): Promise<AcpAuthStatus> {
  let conversationId: string | null = null;
  try {
    const task = await AgentServerConversationService.createConversation();
    conversationId = task.id;
    return "authenticated";
  } catch {
    return "unauthenticated";
  } finally {
    if (conversationId) {
      // Best-effort teardown of the throwaway probe conversation; this also
      // terminates the ACP subprocess the agent-server spawned for it.
      AgentServerConversationService.deleteConversation(conversationId).catch(
        () => {},
      );
    }
  }
}

interface UseAcpAuthStatusOptions {
  /**
   * Gate the probe to when the consuming surface is actually visible — the
   * onboarding modal mounts every slide at once, so without this the probe
   * would fire (and spin a subprocess) before the user reaches the step and
   * before the backend is confirmed connected. Defaults to ``true``.
   */
  enabled?: boolean;
}

/**
 * React Query wrapper around {@link probeAcpAuth}.
 *
 * Gated to **local backends only**: subscription credentials live wherever the
 * agent-server runs, so on a remote/cloud backend they're ~never present and a
 * probe would needlessly spin a runtime — there we return ``"unknown"`` and let
 * the caller fall back to the (already optional) API-key fields.
 *
 * The probe spins and kills a subprocess, so the result is cached for the
 * session (``staleTime: Infinity``, no refetch on focus/mount) — one probe per
 * provider per backend.
 */
export function useAcpAuthStatus(
  providerKey: string | null | undefined,
  options: UseAcpAuthStatusOptions = {},
) {
  const { enabled = true } = options;
  const active = useActiveBackend();
  const isLocal = active.backend.kind === "local";
  const hasCredentials = getAcpProviderSecrets(providerKey).length > 0;
  const isSupported = isLocal && hasCredentials;
  const queryEnabled = enabled && isSupported && !!providerKey;

  const query = useQuery<AcpAuthStatus, Error>({
    queryKey: ["acp-auth-status", active.backend.id, providerKey],
    queryFn: probeAcpAuth,
    enabled: queryEnabled,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 15,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return {
    status: query.data ?? "unknown",
    /** True while the first probe for this provider is in flight. */
    isChecking: queryEnabled && query.isFetching && query.data === undefined,
    /** Whether a probe can run at all on this backend (local + has creds). */
    isSupported,
  };
}
