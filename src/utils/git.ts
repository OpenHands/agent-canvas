import { Provider } from "#/types/settings";
import { GitRepository } from "#/types/git";
import { sanitizeQuery } from "#/utils/sanitize-query";

/**
 * Whether to use the installation-scoped repo flow
 * (`/api/v1/git/installations/search` → `/api/v1/git/repositories/search?installation_id=…`)
 * for the given provider/backend combo.
 *
 * Mirrors OpenHands' cloud frontend (parameterized by `app_mode`):
 *   - bitbucket / bitbucket_data_center → always installation-based
 *   - github → installation-based ONLY when the active backend is cloud
 *   - gitlab / azure_devops / forgejo → direct (search) flow
 *
 * `appMode` accepts the active backend `kind` ("local" | "cloud") so call
 * sites can hand it through directly.
 */
export const shouldUseInstallationRepos = (
  provider: Provider | null | undefined,
  appMode?: "local" | "cloud",
) => {
  if (!provider) return false;

  switch (provider) {
    case "bitbucket":
    case "bitbucket_data_center":
      return true;
    case "github":
      return appMode === "cloud";
    default:
      return false;
  }
};

export const getGitProviderBaseUrl = (
  gitProvider: Provider,
  host?: string | null,
): string => {
  // If custom host provided, use it (with https:// prefix if needed)
  if (host && host.trim() !== "") {
    return host.startsWith("http") ? host : `https://${host}`;
  }

  // Fall back to defaults
  switch (gitProvider) {
    case "github":
      return "https://github.com";
    case "gitlab":
      return "https://gitlab.com";
    case "bitbucket":
      return "https://bitbucket.org";
    case "azure_devops":
      return "https://dev.azure.com";
    case "forgejo":
      // Default UI links to Codeberg unless a custom host is available in settings
      // Note: UI link builders don't currently receive host; consider plumbing settings if needed
      return "https://codeberg.org";
    default:
      return "";
  }
};

/**
 * Get the name of the git provider
 * @param gitProvider The git provider
 * @returns The name of the git provider
 */
export const getProviderName = (gitProvider: Provider) => {
  if (gitProvider === "gitlab") return "GitLab";
  if (gitProvider === "bitbucket") return "Bitbucket";
  if (gitProvider === "bitbucket_data_center") return "Bitbucket Data Center";
  if (gitProvider === "azure_devops") return "Azure DevOps";
  if (gitProvider === "forgejo") return "Forgejo";
  return "GitHub";
};

/**
 * Get the name of the PR
 * @param isGitLab Whether the git provider is GitLab
 * @returns The name of the PR
 */
export const getPR = (isGitLab: boolean) =>
  isGitLab ? "merge request" : "pull request";

/**
 * Get the short name of the PR
 * @param isGitLab Whether the git provider is GitLab
 * @returns The short name of the PR
 */
export const getPRShort = (isGitLab: boolean) => (isGitLab ? "MR" : "PR");

/**
 * Construct the pull request (merge request) URL for different providers
 * @param prNumber The pull request number
 * @param provider The git provider
 * @param repositoryName The repository name in format "owner/repo"
 * @returns The pull request URL
 *
 * @example
 * constructPullRequestUrl(123, "github", "owner/repo") // "https://github.com/owner/repo/pull/123"
 * constructPullRequestUrl(456, "gitlab", "owner/repo") // "https://gitlab.com/owner/repo/-/merge_requests/456"
 * constructPullRequestUrl(789, "bitbucket", "owner/repo") // "https://bitbucket.org/owner/repo/pull-requests/789"
 * constructPullRequestUrl(789, "bitbucket", "PROJECT/repo", "server.com") // "https://server.com/projects/PROJECT/repos/repo/pull-requests/789"
 */
export const constructPullRequestUrl = (
  prNumber: number,
  provider: Provider,
  repositoryName: string,
  host?: string | null,
): string => {
  const baseUrl = getGitProviderBaseUrl(provider, host);

  switch (provider) {
    case "github":
      return `${baseUrl}/${repositoryName}/pull/${prNumber}`;
    case "forgejo":
      return `${baseUrl}/${repositoryName}/pull/${prNumber}`;
    case "gitlab":
      return `${baseUrl}/${repositoryName}/-/merge_requests/${prNumber}`;
    case "bitbucket":
      return `${baseUrl}/${repositoryName}/pull-requests/${prNumber}`;
    case "bitbucket_data_center": {
      const [project, repo] = repositoryName.split("/");
      return `${baseUrl}/projects/${project}/repos/${repo}/pull-requests/${prNumber}`;
    }
    case "azure_devops": {
      // Azure DevOps format: org/project/repo
      const parts = repositoryName.split("/");
      if (parts.length === 3) {
        const [org, project, repo] = parts;
        return `${baseUrl}/${org}/${project}/_git/${repo}/pullrequest/${prNumber}`;
      }
      return "";
    }
    default:
      return "";
  }
};

/**
 * Construct the microagent URL for different providers
 * @param gitProvider The git provider
 * @param repositoryName The repository name in format "owner/repo"
 * @param microagentPath The path to the microagent in the repository
 * @returns The URL to the microagent file in the Git provider
 *
 * @example
 * constructMicroagentUrl("github", "owner/repo", ".openhands/microagents/tell-me-a-joke.md")
 * // "https://github.com/owner/repo/blob/main/.openhands/microagents/tell-me-a-joke.md"
 * constructMicroagentUrl("gitlab", "owner/repo", "microagents/git-helper.md")
 * // "https://gitlab.com/owner/repo/-/blob/main/microagents/git-helper.md"
 * constructMicroagentUrl("bitbucket", "owner/repo", ".openhands/microagents/docker-helper.md")
 * // "https://bitbucket.org/owner/repo/src/main/.openhands/microagents/docker-helper.md"
 */
export const constructMicroagentUrl = (
  gitProvider: Provider,
  repositoryName: string,
  microagentPath: string,
  host?: string | null,
): string => {
  const baseUrl = getGitProviderBaseUrl(gitProvider, host);

  switch (gitProvider) {
    case "github":
      return `${baseUrl}/${repositoryName}/blob/main/${microagentPath}`;
    case "forgejo":
      return `${baseUrl}/${repositoryName}/src/branch/main/${microagentPath}`;
    case "gitlab":
      return `${baseUrl}/${repositoryName}/-/blob/main/${microagentPath}`;
    case "bitbucket":
      return `${baseUrl}/${repositoryName}/src/main/${microagentPath}`;
    case "bitbucket_data_center": {
      const [project, repo] = repositoryName.split("/");
      return `${baseUrl}/projects/${project}/repos/${repo}/browse/${microagentPath}?at=refs/heads/main`;
    }
    case "azure_devops": {
      // Azure DevOps format: org/project/repo
      const parts = repositoryName.split("/");
      if (parts.length === 3) {
        const [org, project, repo] = parts;
        return `${baseUrl}/${org}/${project}/_git/${repo}?path=/${microagentPath}&version=GBmain`;
      }
      return "";
    }
    default:
      return "";
  }
};

/**
 * Extract repository owner, repo name, and file path from repository and microagent data
 * @param selectedRepository The selected repository object with full_name property
 * @param microagent The microagent object with path property
 * @returns Object containing owner, repo, and filePath
 *
 * @example
 * const { owner, repo, filePath } = extractRepositoryInfo(selectedRepository, microagent);
 */
export const extractRepositoryInfo = (
  selectedRepository: { full_name?: string } | null | undefined,
  microagent: { path?: string } | null | undefined,
) => {
  const [owner, repo] = selectedRepository?.full_name?.split("/") || [];
  const filePath = microagent?.path || "";

  return { owner, repo, filePath };
};

/**
 * Construct the repository URL for different providers
 * @param provider The git provider
 * @param repositoryName The repository name in format "owner/repo"
 * @returns The repository URL
 *
 * @example
 * constructRepositoryUrl("github", "owner/repo") // "https://github.com/owner/repo"
 * constructRepositoryUrl("gitlab", "owner/repo") // "https://gitlab.com/owner/repo"
 * constructRepositoryUrl("bitbucket", "owner/repo") // "https://bitbucket.org/owner/repo"
 */
export const constructRepositoryUrl = (
  provider: Provider,
  repositoryName: string,
  host?: string | null,
): string => {
  const baseUrl = getGitProviderBaseUrl(provider, host);
  if (provider === "bitbucket_data_center") {
    const [project, repo] = repositoryName.split("/");
    return `${baseUrl}/projects/${project}/repos/${repo}`;
  }
  return `${baseUrl}/${repositoryName}`;
};

/**
 * Construct the branch URL for different providers
 * @param provider The git provider
 * @param repositoryName The repository name in format "owner/repo"
 * @param branchName The branch name
 * @param host Optional custom host for self-hosted instances
 * @returns The branch URL
 *
 * @example
 * constructBranchUrl("github", "owner/repo", "main") // "https://github.com/owner/repo/tree/main"
 * constructBranchUrl("gitlab", "owner/repo", "develop") // "https://gitlab.com/owner/repo/-/tree/develop"
 * constructBranchUrl("bitbucket", "owner/repo", "feature") // "https://bitbucket.org/owner/repo/src/feature"
 * constructBranchUrl("bitbucket", "PROJECT/repo", "feature", "server.com") // "https://server.com/projects/PROJECT/repos/repo/browse?at=refs/heads/feature"
 */
export const constructBranchUrl = (
  provider: Provider,
  repositoryName: string,
  branchName: string,
  host?: string | null,
): string => {
  const baseUrl = getGitProviderBaseUrl(provider, host);

  switch (provider) {
    case "github":
      return `${baseUrl}/${repositoryName}/tree/${branchName}`;
    case "forgejo":
      return `${baseUrl}/${repositoryName}/src/branch/${branchName}`;
    case "gitlab":
      return `${baseUrl}/${repositoryName}/-/tree/${branchName}`;
    case "bitbucket":
      return `${baseUrl}/${repositoryName}/src/${branchName}`;
    case "bitbucket_data_center": {
      // Bitbucket Server format: /projects/{PROJECT}/repos/{repo}/browse?at=refs/heads/{branch}
      const parts = repositoryName.split("/");
      if (parts.length >= 2) {
        const [project, repo] = parts;
        return `${baseUrl}/projects/${project}/repos/${repo}/browse?at=refs/heads/${branchName}`;
      }
      return "";
    }
    case "azure_devops": {
      // Azure DevOps format: org/project/repo
      const parts = repositoryName.split("/");
      if (parts.length === 3) {
        const [org, project, repo] = parts;
        return `${baseUrl}/${org}/${project}/_git/${repo}?version=GB${branchName}`;
      }
      return "";
    }
    default:
      return "";
  }
};

// Git Action Prompts

/**
 * Generate a git pull prompt
 * @returns The git pull prompt
 */
export const getGitPullPrompt = (): string =>
  "Please pull the latest code from the repository.";

/**
 * Generate a git push prompt
 * @param gitProvider The git provider
 * @returns The git push prompt
 */
export const getGitPushPrompt = (gitProvider: Provider): string => {
  const providerName = getProviderName(gitProvider);
  const pr = getPR(gitProvider === "gitlab");

  return `Please push the changes to a remote branch on ${providerName}, but do NOT create a ${pr}. Check your current branch name first - if it's main, master, deploy, or another common default branch name, create a new branch with a descriptive name related to your changes. Otherwise, use the exact SAME branch name as the one you are currently on.`;
};

/**
 * Generate a create pull request prompt
 * @param gitProvider The git provider
 * @returns The create PR prompt
 */
export const getCreatePRPrompt = (gitProvider: Provider): string => {
  const providerName = getProviderName(gitProvider);
  const pr = getPR(gitProvider === "gitlab");
  const prShort = getPRShort(gitProvider === "gitlab");

  return `Please push the changes to ${providerName} and open a ${pr}. If you're on a default branch (e.g., main, master, deploy), create a new branch with a descriptive name otherwise use the current branch. If a ${pr} template exists in the repository, please follow it when creating the ${prShort} description.`;
};

/**
 * Generate a push to existing PR prompt
 * @param gitProvider The git provider
 * @returns The push to PR prompt
 */
export const getPushToPRPrompt = (gitProvider: Provider): string => {
  const pr = getPR(gitProvider === "gitlab");

  return `Please push the latest changes to the existing ${pr}.`;
};

/**
 * Generate a create new branch prompt
 * @returns The create new branch prompt
 */
export const getCreateNewBranchPrompt = (): string =>
  "Please create a new branch with a descriptive name related to the work you plan to do.";

/**
 * Get the repository markdown creation prompt with additional PR creation instructions
 * @param gitProvider The git provider to use for generating provider-specific text
 * @param query Optional custom query to use instead of the default prompt
 * @returns The complete prompt for creating repository markdown and PR instructions
 */
export const getRepoMdCreatePrompt = (
  gitProvider: Provider,
  query?: string,
): string => {
  const providerName = getProviderName(gitProvider);
  const pr = getPR(gitProvider === "gitlab");
  const prShort = getPRShort(gitProvider === "gitlab");

  return `Please explore this repository. Create the file .openhands/microagents/repo.md with:
            ${
              query
                ? `- ${query}`
                : `- A description of the project
            - An overview of the file structure
            - Any information on how to run tests or other relevant commands
            - Any other information that would be helpful to a brand new developer
        Keep it short--just a few paragraphs will do.`
            }

Please push the changes to your branch on ${providerName} and create a ${pr}. Please create a meaningful branch name that describes the changes. If a ${pr} template exists in the repository, please follow it when creating the ${prShort} description.`;
};

/**
 * Helper function to apply client-side filtering based on search query
 * @param repo The Git repository to check
 * @param searchQuery The search query string
 * @returns True if the repository should be included based on the search query
 */
export const shouldIncludeRepository = (
  repo: GitRepository,
  searchQuery: string,
): boolean => {
  if (!searchQuery.trim()) {
    return true;
  }

  const sanitizedQuery = sanitizeQuery(searchQuery);
  const sanitizedRepoName = sanitizeQuery(repo.full_name);
  return sanitizedRepoName.includes(sanitizedQuery);
};

/**
 * Get the OpenHands query string based on the provider
 * @param provider The git provider
 * @returns The query string for searching OpenHands repositories
 */
export const getOpenHandsQuery = (provider: Provider | null): string => {
  const providerRepositorySuffix: Record<string, string> = {
    gitlab: "openhands-config",
    azure_devops: "openhands-config",
    default: ".openhands",
  } as const;

  return provider && provider in providerRepositorySuffix
    ? providerRepositorySuffix[provider]
    : providerRepositorySuffix.default;
};

/**
 * Check if a repository has the OpenHands suffix based on the provider
 * @param repo The Git repository to check
 * @param provider The git provider
 * @returns True if the repository has the OpenHands suffix
 */
export const hasOpenHandsSuffix = (
  repo: GitRepository,
  provider: Provider | null,
): boolean => repo.full_name.endsWith(`/${getOpenHandsQuery(provider)}`);
