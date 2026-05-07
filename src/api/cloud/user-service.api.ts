import { getActiveBackend } from "../backend-registry/active-store";
import type { Backend } from "../backend-registry/types";
import { callCloudProxy } from "./proxy";
import type { CloudGitUser } from "./types";

function getActiveCloudBackend(): Backend {
  const active = getActiveBackend().backend;
  if (active.kind !== "cloud") {
    throw new Error("Cloud user calls require a cloud backend.");
  }
  return active;
}

/**
 * Fetch the SaaS git-info record (`GET /api/v1/users/git-info`). Returns
 * the currently authenticated user's identity across the connected git
 * providers — login, avatar, etc.
 *
 * Routed through the bundled agent-server's cloud proxy.
 */
export async function getCloudGitUser(
  backend?: Backend,
): Promise<CloudGitUser> {
  const target = backend ?? getActiveCloudBackend();
  const data = await callCloudProxy<CloudGitUser>({
    backend: target,
    method: "GET",
    path: "/api/v1/users/git-info",
  });
  return data;
}
