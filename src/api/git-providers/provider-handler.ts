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

const firstConfiguredService = (): GitProviderService => {
  const all = collectAllServices();
  if (all.length === 0) {
    throw new GitProviderAuthError("No git provider configured");
  }
  return all[0];
};

export const ProviderHandler = {
  getServiceForProvider: getServiceFor,

  async getUserGitInfo(provider?: Provider): Promise<GitUser> {
    const service = provider
      ? requireService(provider)
      : firstConfiguredService();
    return service.getUser();
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
