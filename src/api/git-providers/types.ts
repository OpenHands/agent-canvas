import { SuggestedTask } from "#/utils/types";
import { Provider, ProviderToken } from "#/types/settings";
import {
  BranchPage,
  GitUser,
  InstallationPage,
  RepositoryPage,
} from "#/types/git";

export type SortOrder =
  | "stars-desc"
  | "stars-asc"
  | "forks-desc"
  | "forks-asc"
  | "updated-desc"
  | "updated-asc";

export interface SuggestedTaskPage {
  items: SuggestedTask[];
  next_page_id: string | null;
}

export interface SearchRepositoriesOptions {
  query?: string;
  installationId?: string;
  pageId?: string | null;
  limit: number;
  sortOrder?: SortOrder;
}

export interface ListBranchesOptions {
  repository: string;
  query?: string;
  pageId?: string | null;
  limit: number;
}

export interface ListInstallationsOptions {
  pageId?: string | null;
  limit: number;
}

/**
 * Mirror of openhands/app_server/integrations/service_types.py:GitService.
 *
 * Each provider implements this interface against its own REST/GraphQL API.
 * Methods return shapes compatible with the v1 router contract so the
 * existing UI hooks do not need to change.
 */
export interface GitProviderService {
  readonly provider: Provider;
  getUser(): Promise<GitUser>;
  getSuggestedTasks(): Promise<SuggestedTask[]>;
  searchRepositories(
    options: SearchRepositoriesOptions,
  ): Promise<RepositoryPage>;
  getBranches(options: ListBranchesOptions): Promise<BranchPage>;
  getInstallations(
    options: ListInstallationsOptions,
  ): Promise<InstallationPage>;
}

export interface ProviderCredentials {
  provider: Provider;
  token: ProviderToken;
}

export class GitProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitProviderAuthError";
  }
}
