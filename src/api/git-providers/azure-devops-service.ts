import { SuggestedTask } from "#/utils/types";
import { ProviderToken } from "#/types/settings";
import {
  Branch,
  BranchPage,
  GitRepository,
  GitUser,
  InstallationPage,
  RepositoryPage,
} from "#/types/git";
import {
  GitProviderAuthError,
  GitProviderService,
  ListBranchesOptions,
  ListInstallationsOptions,
  SearchRepositoriesOptions,
} from "./types";
import { paginateResults } from "./paging-utils";

const PROFILE_URL =
  "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1";
const ACCOUNTS_URL_BASE =
  "https://app.vssps.visualstudio.com/_apis/accounts?api-version=7.1";

const buildAuthHeader = (token: string): string => {
  if (token.includes(":")) {
    const encoded =
      typeof window === "undefined"
        ? Buffer.from(token).toString("base64")
        : btoa(token);
    return `Basic ${encoded}`;
  }
  // Azure DevOps PATs use Basic auth with empty username.
  const encoded =
    typeof window === "undefined"
      ? Buffer.from(`:${token}`).toString("base64")
      : btoa(`:${token}`);
  return `Basic ${encoded}`;
};

interface AzureDevOpsRepo {
  id: string;
  name: string;
  project?: { name?: string };
  defaultBranch?: string;
}

interface AzureDevOpsRef {
  name: string;
  objectId: string;
}

export class AzureDevOpsService implements GitProviderService {
  readonly provider = "azure_devops" as const;

  private readonly token: string;

  constructor(credentials: ProviderToken) {
    if (!credentials.token) {
      throw new GitProviderAuthError("Azure DevOps token is empty");
    }
    this.token = credentials.token;
  }

  private headers(): HeadersInit {
    return {
      Authorization: buildAuthHeader(this.token),
      Accept: "application/json",
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: this.headers() });
    if (response.status === 401) {
      throw new GitProviderAuthError("Azure DevOps token rejected (401)");
    }
    if (!response.ok) {
      throw new Error(`Azure DevOps request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }

  async getUser(): Promise<GitUser> {
    const data = await this.fetchJson<{
      id: string;
      displayName?: string;
      emailAddress?: string;
      coreAttributes?: { Avatar?: { value?: { value?: string } } };
    }>(PROFILE_URL);
    return {
      id: String(data.id ?? ""),
      login: data.displayName ?? "",
      avatar_url: data.coreAttributes?.Avatar?.value?.value ?? "",
      name: data.displayName ?? null,
      email: data.emailAddress ?? null,
      company: null,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  async getSuggestedTasks(): Promise<SuggestedTask[]> {
    return [];
  }

  async searchRepositories(
    options: SearchRepositoriesOptions,
  ): Promise<RepositoryPage> {
    const { installationId, query, pageId, limit } = options;
    if (!installationId) {
      // Without an organization the API can't enumerate repos.
      return { items: [], next_page_id: null };
    }
    const data = await this.fetchJson<{ value: AzureDevOpsRepo[] }>(
      `https://dev.azure.com/${encodeURIComponent(installationId)}/_apis/git/repositories?api-version=7.1`,
    );
    let repos = data.value;
    if (query) {
      const lowered = query.toLowerCase();
      repos = repos.filter((r) => r.name.toLowerCase().includes(lowered));
    }
    const mapped = repos.map((r) =>
      this.parseRepository(r, installationId, r.project?.name ?? ""),
    );
    return paginateResults(mapped, pageId, limit);
  }

  async getBranches(options: ListBranchesOptions): Promise<BranchPage> {
    const { repository, query, pageId, limit } = options;
    const parts = repository.split("/");
    if (parts.length < 3) return { items: [], next_page_id: null };
    const [org, project, repo] = [parts[0], parts[1], parts.slice(2).join("/")];
    const data = await this.fetchJson<{ value: AzureDevOpsRef[] }>(
      `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}/refs?api-version=7.1&filter=heads/`,
    );
    let branches = data.value.map((ref) => ({
      name: ref.name.replace(/^refs\/heads\//u, ""),
      objectId: ref.objectId,
    }));
    if (query) {
      const lowered = query.toLowerCase();
      branches = branches.filter((b) => b.name.toLowerCase().includes(lowered));
    }
    const items: Branch[] = branches.map((b) => ({
      name: b.name,
      commit_sha: b.objectId,
      protected: false,
    }));
    return paginateResults(items, pageId, limit);
  }

  async getInstallations(
    options: ListInstallationsOptions,
  ): Promise<InstallationPage> {
    const profile = await this.fetchJson<{ id: string }>(PROFILE_URL);
    const accounts = await this.fetchJson<{
      value: Array<{ accountName: string }>;
    }>(`${ACCOUNTS_URL_BASE}&memberId=${encodeURIComponent(profile.id)}`);
    const items = accounts.value.map((account) => account.accountName);
    return paginateResults(items, options.pageId, options.limit);
  }

  // eslint-disable-next-line class-methods-use-this
  private parseRepository(
    repo: AzureDevOpsRepo,
    organization: string,
    project: string,
  ): GitRepository {
    return {
      id: repo.id,
      full_name: `${organization}/${project}/${repo.name}`,
      git_provider: "azure_devops",
      is_public: false,
      main_branch: repo.defaultBranch?.replace(/^refs\/heads\//u, ""),
    };
  }
}
