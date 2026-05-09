import { useQueries } from "@tanstack/react-query";
import { getCurrentCloudApiKey } from "#/api/cloud/organization-service.api";
import type { Backend } from "#/api/backend-registry/types";
import { createServerClient } from "#/api/typescript-client";

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

  await createServerClient({
    host: backend.host,
    sessionApiKey: backend.apiKey || null,
    timeout: PROBE_TIMEOUT_MS,
  }).getServerInfo();
  return true;
}

export interface BackendHealth {
  /** `null` while the first probe is in flight; then `true` / `false`. */
  isConnected: boolean | null;
}

/**
 * Poll every backend in `backends` once every 10s and report a simple
 * connected / disconnected verdict per backend id.
 *
 * The query key includes `host` and `apiKey` so editing a backend's
 * connection details re-keys the query and triggers an immediate
 * refetch instead of waiting for the next tick.
 */
export function useBackendsHealth(
  backends: Backend[],
): Record<string, BackendHealth> {
  const results = useQueries({
    queries: backends.map((b) => ({
      queryKey: [
        "backend-health",
        b.id,
        b.kind,
        b.host,
        b.apiKey ?? "",
      ] as const,
      queryFn: () => probeBackend(b),
      refetchInterval: REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: false,
      retry: false,
      // Keep the previous verdict visible while the next probe is in
      // flight so the indicator doesn't flicker every 2s.
      staleTime: REFRESH_INTERVAL_MS,
      meta: { disableToast: true },
    })),
  });

  const out: Record<string, BackendHealth> = {};
  backends.forEach((b, i) => {
    const r = results[i];
    let isConnected: boolean | null;
    if (r.isSuccess) isConnected = true;
    else if (r.isError) isConnected = false;
    else isConnected = null;
    out[b.id] = { isConnected };
  });
  return out;
}
