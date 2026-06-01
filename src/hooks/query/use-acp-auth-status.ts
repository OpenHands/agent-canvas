import { useQuery } from "@tanstack/react-query";
import type { ACPAuthStatusValue } from "@openhands/typescript-client";
import AcpService from "#/api/acp-service/acp-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";

/** Re-exported from the client so the union has a single source of truth. */
export type AcpAuthStatus = ACPAuthStatusValue;

/**
 * Probe whether the selected ACP provider's CLI is already authenticated on
 * the agent-server — by a subscription login (Claude Pro/Max, ChatGPT, Google)
 * or a pre-set API key.
 *
 * Calls the agent-server's purpose-built ``GET /api/acp/auth-status`` endpoint,
 * which drives the ACP ``initialize`` + ``session/new`` handshake server-side
 * and classifies the outcome — ``session/new`` succeeding ⇒ authenticated, an
 * ``auth_required`` error ⇒ unauthenticated, and anything that prevents the
 * probe from completing ⇒ unknown. No prompt is sent, so no model tokens are
 * spent.
 *
 * This is "Phase 1" of issue #964: it replaces the canvas-only "Phase 0"
 * throwaway-conversation probe (create → observe → delete) now that the
 * agent-server (software-agent-sdk #3452) exposes a dedicated endpoint. The
 * hook's public shape is unchanged, so the onboarding banner UI that consumes
 * it did not need to change.
 */
async function probeAcpAuth(providerKey: string): Promise<AcpAuthStatus> {
  try {
    const { status } = await AcpService.getAuthStatus(providerKey);
    // ``status`` is already authenticated / unauthenticated / unknown.
    return status;
  } catch {
    // The endpoint is unreachable, rejected the request (e.g. an unknown
    // provider → 422), or the agent-server predates the route (→ 404): fall
    // back to "unknown" so the caller shows the API-key fields rather than
    // falsely claiming "not logged in".
    return "unknown";
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
 * Eligibility is intentionally *not* tied to whether the provider has API-key
 * fields: the server can detect subscription/OAuth providers (e.g. Gemini)
 * too, and an unknown/unsupported ``providerKey`` simply comes back as
 * ``"unknown"`` (the endpoint 422s → caught below). The caller renders this
 * hook only for ACP providers, so any local backend is probeable.
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
  const isSupported = isLocal;
  const queryEnabled = enabled && isSupported && !!providerKey;

  const query = useQuery<AcpAuthStatus, Error>({
    // ``providerKey`` both discriminates the cache (so switching providers
    // re-probes) and parameterizes the probe — ``queryEnabled`` guarantees it
    // is non-empty whenever the query runs.
    queryKey: ["acp-auth-status", active.backend.id, providerKey],
    queryFn: () => probeAcpAuth(providerKey as string),
    enabled: queryEnabled,
    // ``staleTime: Infinity`` = never re-probe while the result stays cached;
    // ``gcTime`` then bounds that to ~15 min after the hook unmounts. So a
    // user who dismisses and reopens onboarding >15 min later re-probes —
    // intentional: it's a cheap one-off and their login state may have changed.
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
    /** Whether a probe can run at all on this backend (local backends only). */
    isSupported,
  };
}
