import { getActiveBackend } from "../backend-registry/active-store";
import type { Backend } from "../backend-registry/types";
import { callCloudProxy } from "./proxy";

/**
 * Cloud (SaaS) authentication probe. Routed through the bundled local
 * agent-server's `/api/cloud-proxy` to avoid cross-origin browser calls.
 *
 * Returns true if the API key is accepted by the cloud backend.
 */
export async function authenticateCloud(backend?: Backend): Promise<boolean> {
  const target =
    backend ??
    (() => {
      const active = getActiveBackend().backend;
      if (active.kind !== "cloud") {
        throw new Error(
          "authenticateCloud requires a cloud backend. Active backend is local.",
        );
      }
      return active;
    })();
  await callCloudProxy<unknown>({
    backend: target,
    method: "POST",
    path: "/api/authenticate",
  });
  return true;
}
