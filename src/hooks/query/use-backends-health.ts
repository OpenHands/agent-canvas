import React from "react";
import { useQueries } from "@tanstack/react-query";
import { ServerClient } from "@openhands/typescript-client/clients";
import { getCurrentCloudApiKey } from "#/api/cloud/organization-service.api";
import type { Backend } from "#/api/backend-registry/types";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import {
  getHealthSnapshot,
  recordBackendFailure,
  recordBackendSuccess,
  subscribeBackendHealth,
} from "#/api/backend-registry/health-store";
import { MAX_CONSECUTIVE_FAILURES } from "#/api/backend-registry/health-storage";

const REFRESH_INTERVAL_MS = 10000;
const PROBE_TIMEOUT_MS = 4000;

/**
 * Probe a single backend for connectivity. The probe path differs by
 * backend kind:
 *
 *  - Local agent-server: GET `/server_info` via the typescript-client.
 *    That's the same endpoint the root compatibility check uses, so a
 *    healthy backend always answers it.
 *  - Cloud SaaS: GET `/api/keys/current` via the bundled local
 *    agent-server's `/api/cloud-proxy`. That endpoint is lightweight,
 *    requires auth, and `getCurrentCloudApiKey` already absorbs the
 *    legacy-key 400 fallback so we treat that as "connected" too.
 *    Any other failure (network, 401, 5xx, …) means the backend is
 *    not reachable / not usable from the GUI.
 *
 * Throws on failure so React Query marks the query as errored — the
 * dropdown reads `isSuccess` to flip the indicator green.
 */
async function probeBackend(backend: Backend): Promise<true> {
  if (backend.kind === "cloud") {
    await getCurrentCloudApiKey(backend);
    return true;
  }

  await new ServerClient(
    getAgentServerClientOptions({
      host: backend.host,
      sessionApiKey: backend.apiKey || null,
      timeout: PROBE_TIMEOUT_MS,
    }),
  ).getServerInfo();
  return true;
}

export interface BackendHealth {
  /** `null` while the first probe is in flight; then `true` / `false`. */
  isConnected: boolean | null;
  /** Number of consecutive failed probes since the last success. */
  consecutiveFailures: number;
  /** Last error message captured from a failed probe, if any. */
  lastError: string | null;
  /**
   * `true` once `consecutiveFailures` reaches the cap. While disabled,
   * the hook stops polling and survives a page refresh in that state.
   * Polling resumes only when the user edits the backend's host or
   * api key (see `active-backend-context.tsx`).
   */
  disabled: boolean;
}

/**
 * Poll every backend in `backends` once every 10s and report a simple
 * connected / disconnected verdict per backend id.
 *
 * The query key includes `host` and `apiKey` so editing a backend's
 * connection details re-keys the query and triggers an immediate
 * refetch instead of waiting for the next tick.
 *
 * After `MAX_CONSECUTIVE_FAILURES` failures in a row, polling stops
 * for that backend until the user updates its host / apiKey. The
 * failure count and last error live in localStorage so a page refresh
 * does not silently re-arm polling against a backend that's known to
 * be unreachable.
 */
export function useBackendsHealth(
  backends: Backend[],
): Record<string, BackendHealth> {
  const healthMap = React.useSyncExternalStore(
    subscribeBackendHealth,
    getHealthSnapshot,
    getHealthSnapshot,
  );

  const results = useQueries({
    queries: backends.map((b) => {
      const isDisabled = healthMap[b.id]?.disabled === true;
      return {
        queryKey: [
          "backend-health",
          b.id,
          b.kind,
          b.host,
          b.apiKey ?? "",
        ] as const,
        queryFn: async () => {
          try {
            const result = await probeBackend(b);
            recordBackendSuccess(b.id);
            return result;
          } catch (err) {
            recordBackendFailure(b.id, err);
            throw err;
          }
        },
        enabled: !isDisabled,
        refetchInterval: isDisabled ? (false as const) : REFRESH_INTERVAL_MS,
        refetchIntervalInBackground: false,
        retry: false,
        // Keep the previous verdict visible while the next probe is in
        // flight so the indicator doesn't flicker every 2s.
        staleTime: REFRESH_INTERVAL_MS,
        meta: { disableToast: true },
      };
    }),
  });

  const out: Record<string, BackendHealth> = {};
  backends.forEach((b, i) => {
    const r = results[i];
    const entry = healthMap[b.id];
    const disabled = entry?.disabled === true;
    const consecutiveFailures = entry?.consecutiveFailures ?? 0;
    const lastError = entry?.lastError ?? null;

    let isConnected: boolean | null;
    if (disabled) {
      // Polling stopped after hitting the cap — treat as disconnected
      // so existing consumers (dot, badge) render red without needing
      // to know about the new fields.
      isConnected = false;
    } else if (r.isSuccess) isConnected = true;
    else if (r.isError) isConnected = false;
    else isConnected = null;

    out[b.id] = { isConnected, consecutiveFailures, lastError, disabled };
  });
  return out;
}

export { MAX_CONSECUTIVE_FAILURES };
