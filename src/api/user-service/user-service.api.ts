import { GitUser } from "#/types/git";
import { ProviderHandler } from "../git-providers/provider-handler";

/**
 * User Service API - Handles all user-related API endpoints.
 *
 * The OSS agent-server runtime does not expose /api/v1/users/git-info, so we
 * resolve the user directly from the configured git provider in the browser.
 */
class UserService {
  static async getUser(): Promise<GitUser> {
    return ProviderHandler.getUserGitInfo();
  }
}

export default UserService;
