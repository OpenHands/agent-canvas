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
import { decodePageId, encodePageId } from "./paging-utils";

const buildAuthHeader = (token: string): string =>
  token.includes(":")
    ? `Basic ${typeof window === "undefined" ? Buffer.from(token).toString("base64") : btoa(token)}`
    : `Bearer ${token}`;

interface BitbucketDCRepo {
  id: number | string;
  slug: string;
  project: { key: string };
  public?: boolean;
}

interface BitbucketDCBranch {
  id?: string;
  displayId?: string;
  latestCommit?: string;
}

export class BitbucketDataCenterService implements GitProviderService {
  readonly provider = "bitbucket_data_center" as const;

  private readonly token: string;

  private readonly baseUrl: string;

  constructor(credentials: ProviderToken) {
    if (!credentials.token) {
      throw new GitProviderAuthError("Bitbucket DC token is empty");
    }
    if (!credentials.host) {
      throw new GitProviderAuthError("Bitbucket DC requires a host URL");
    }
    this.token = credentials.token;
    const trimmed = credentials.host
      .replace(/^https?:\/\//iu, "")
      .replace(/\/+$/u, "");
    this.baseUrl = `https://${trimmed}/rest/api/1.0`;
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
      throw new GitProviderAuthError("Bitbucket DC token rejected (401)");
    }
    if (!response.ok) {
      throw new Error(`Bitbucket DC request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }

  // eslint-disable-next-line class-methods-use-this
  async getUser(): Promise<GitUser> {
    // Bitbucket DC's /user endpoint returns nothing useful for HTTP access
    // tokens. Fall back to the empty-but-valid response the Python service
    // returns so the UI can detect "no profile" gracefully.
    return {
      id: "",
      login: "",
      avatar_url: "",
      name: null,
      email: null,
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
    const { query, installationId, pageId, limit } = options;
    const projectKey =
      installationId ??
      (query?.includes("/") ? query.split("/")[0] : undefined);
    if (!projectKey) {
      return { items: [], next_page_id: null };
    }
    const start = decodePageId(pageId) ?? 0;
    const params = new URLSearchParams({
      limit: String(limit),
      start: String(start),
    });
    const data = await this.fetchJson<{
      values: BitbucketDCRepo[];
      isLastPage?: boolean;
      nextPageStart?: number;
    }>(`${this.baseUrl}/projects/${projectKey}/repos?${params.toString()}`);
    const items = data.values.map((repo) => this.parseRepository(repo));
    const nextPageId =
      !data.isLastPage && typeof data.nextPageStart === "number"
        ? encodePageId(data.nextPageStart)
        : null;
    return { items, next_page_id: nextPageId };
  }

  async getBranches(options: ListBranchesOptions): Promise<BranchPage> {
    const { repository, query, pageId, limit } = options;
    const parts = repository.split("/");
    if (parts.length < 2) return { items: [], next_page_id: null };
    const [project, slug] = [parts[parts.length - 2], parts[parts.length - 1]];
    const start = decodePageId(pageId) ?? 0;
    const params = new URLSearchParams({
      limit: String(limit),
      start: String(start),
      orderBy: "MODIFICATION",
    });
    if (query) params.set("filterText", query);
    const data = await this.fetchJson<{
      values: BitbucketDCBranch[];
      isLastPage?: boolean;
      nextPageStart?: number;
    }>(
      `${this.baseUrl}/projects/${project}/repos/${slug}/branches?${params.toString()}`,
    );
    const items: Branch[] = data.values.map((branch) => ({
      name: branch.displayId ?? branch.id?.replace("refs/heads/", "") ?? "",
      commit_sha: branch.latestCommit ?? "",
      protected: false,
    }));
    const nextPageId =
      !data.isLastPage && typeof data.nextPageStart === "number"
        ? encodePageId(data.nextPageStart)
        : null;
    return { items, next_page_id: nextPageId };
  }

  async getInstallations(
    options: ListInstallationsOptions,
  ): Promise<InstallationPage> {
    const { pageId, limit } = options;
    const start = decodePageId(pageId) ?? 0;
    const data = await this.fetchJson<{
      values: Array<{ key: string }>;
      isLastPage?: boolean;
      nextPageStart?: number;
    }>(
      `${this.baseUrl}/projects?${new URLSearchParams({
        limit: String(limit),
        start: String(start),
      }).toString()}`,
    );
    const items = data.values.map((p) => p.key);
    const nextPageId =
      !data.isLastPage && typeof data.nextPageStart === "number"
        ? encodePageId(data.nextPageStart)
        : null;
    return { items, next_page_id: nextPageId };
  }

  // eslint-disable-next-line class-methods-use-this
  private parseRepository(repo: BitbucketDCRepo): GitRepository {
    return {
      id: String(repo.id ?? ""),
      full_name: `${repo.project.key}/${repo.slug}`,
      git_provider: "bitbucket_data_center",
      is_public: repo.public ?? false,
    };
  }
}
