import { GitUser } from "#/types/git";
import { getActiveBackend } from "../backend-registry/active-store";
import { getCloudGitUser } from "../cloud/user-service.api";
import { ProviderHandler } from "../git-providers/provider-handler";

/**
 * User Service API - Handles all user-related API endpoints.
 *
 * Local mode: the OSS agent-server runtime does not expose
 * `/api/v1/users/git-info`, so we resolve the user directly from the
 * configured git provider in the browser via `ProviderHandler`. If no
 * provider tokens are stored locally, this throws
 * "No git provider configured" — the right signal for local operation.
 *
 * Cloud mode: the SaaS exposes `/api/v1/users/git-info` and holds
 * provider tokens server-side. There is nothing local to check, so we
 * route through the cloud proxy. The local "no provider configured"
 * check is meaningless for cloud and would otherwise surface as a false
 * toast — branching here keeps it scoped to local.
 */
class UserService {
  static async getUser(): Promise<GitUser | null> {
    if (getActiveBackend().backend.kind === "cloud") {
      return getCloudGitUser();
    }
    return ProviderHandler.getUserGitInfo();
  }
}

export default UserService;
