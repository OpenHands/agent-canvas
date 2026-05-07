import { SuggestedTask } from "#/utils/types";
import { Provider, ProviderToken } from "#/types/settings";
import {
  BranchPage,
  GitUser,
  InstallationPage,
  RepositoryPage,
} from "#/types/git";
import { getStoredGitProviderToken } from "../secrets-service";
import {
  GitProviderAuthError,
  GitProviderService,
  ListBranchesOptions,
  ListInstallationsOptions,
  SearchRepositoriesOptions,
  SuggestedTaskPage,
} from "./types";
import { GitHubService } from "./github-service";
import { GitLabService } from "./gitlab-service";
import { BitbucketService } from "./bitbucket-service";
import { BitbucketDataCenterService } from "./bitbucket-dc-service";
import { AzureDevOpsService } from "./azure-devops-service";
import { ForgejoService } from "./forgejo-service";
import { paginateResults } from "./paging-utils";

const PROVIDER_ORDER: Provider[] = [
  "github",
  "gitlab",
  "bitbucket",
  "bitbucket_data_center",
  "azure_devops",
  "forgejo",
];

const buildService = (
  provider: Provider,
  credentials: ProviderToken,
): GitProviderService | null => {
  try {
    switch (provider) {
      case "github":
        return new GitHubService(credentials);
      case "gitlab":
        return new GitLabService(credentials);
      case "bitbucket":
        return new BitbucketService(credentials);
      case "bitbucket_data_center":
        return new BitbucketDataCenterService(credentials);
      case "azure_devops":
        return new AzureDevOpsService(credentials);
      case "forgejo":
        return new ForgejoService(credentials);
      default:
        return null;
    }
  } catch (error) {
    if (error instanceof GitProviderAuthError) {
      return null;
    }
    throw error;
  }
};

const getServiceFor = (provider: Provider): GitProviderService | null => {
  const credentials = getStoredGitProviderToken(provider);
  if (!credentials?.token) return null;
  return buildService(provider, credentials);
};

const collectAllServices = (): GitProviderService[] =>
  PROVIDER_ORDER.flatMap((provider) => {
    const service = getServiceFor(provider);
    return service ? [service] : [];
  });

const requireService = (provider: Provider): GitProviderService => {
  const service = getServiceFor(provider);
  if (!service) {
    throw new GitProviderAuthError(
      `No git provider configured for ${provider}`,
    );
  }
  return service;
};

const firstConfiguredService = (): GitProviderService | null => {
  const all = collectAllServices();
  return all[0] ?? null;
};

export const ProviderHandler = {
  getServiceForProvider: getServiceFor,

  /**
   * Resolve the calling user's git profile from any locally-configured
   * provider. Returns `null` when no provider is configured — the
   * caller (e.g. `useGitUser`) treats that as "no info to show", which
   * is the right outcome for a clean local install or for the brief
   * window after a Cloud → Local switch where settings haven't refetched
   * yet. Throwing here would surface as a global error toast.
   *
   * When a `provider` is passed explicitly, missing local credentials
   * are still an error — the caller asked for that specific provider,
   * so we propagate `requireService`'s `GitProviderAuthError`.
   */
  async getUserGitInfo(provider?: Provider): Promise<GitUser | null> {
    if (provider) {
      return requireService(provider).getUser();
    }
    const service = firstConfiguredService();
    return service ? service.getUser() : null;
  },

  async getSuggestedTasks(
    pageId?: string | null,
    limit = 30,
  ): Promise<SuggestedTaskPage> {
    const services = collectAllServices();
    const results = await Promise.all(
      services.map((service) =>
        service.getSuggestedTasks().catch(() => [] as SuggestedTask[]),
      ),
    );
    const all = results.flat();
    return paginateResults(all, pageId ?? null, limit);
  },

  async searchRepositories(
    provider: Provider,
    options: SearchRepositoriesOptions,
  ): Promise<RepositoryPage> {
    return requireService(provider).searchRepositories(options);
  },

  async getBranches(
    provider: Provider,
    options: ListBranchesOptions,
  ): Promise<BranchPage> {
    return requireService(provider).getBranches(options);
  },

  async getInstallations(
    provider: Provider,
    options: ListInstallationsOptions,
  ): Promise<InstallationPage> {
    return requireService(provider).getInstallations(options);
  },
};

export { GitProviderAuthError };
