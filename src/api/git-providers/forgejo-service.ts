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
  SearchRepositoriesOptions,
} from "./types";
import { decodePageId, encodePageId } from "./paging-utils";

const DEFAULT_BASE_URL = "https://codeberg.org/api/v1";

const resolveBaseUrl = (host: string | null): string => {
  if (!host) return DEFAULT_BASE_URL;
  const normalized = host.replace(/\/+$/u, "");
  if (/^https?:\/\//iu.test(normalized)) {
    return normalized.includes("/api/") ? normalized : `${normalized}/api/v1`;
  }
  return `https://${normalized}/api/v1`;
};

interface ForgejoRepo {
  id: number | string;
  full_name: string;
  default_branch?: string;
  stars_count?: number;
  updated_at?: string;
  private?: boolean;
}

interface ForgejoBranch {
  name: string;
  commit?: { id?: string; sha?: string };
  protected?: boolean;
}

export class ForgejoService implements GitProviderService {
  readonly provider = "forgejo" as const;

  private readonly token: string;

  private readonly baseUrl: string;

  private cachedUserId: string | null = null;

  constructor(credentials: ProviderToken) {
    if (!credentials.token) {
      throw new GitProviderAuthError("Forgejo token is empty");
    }
    this.token = credentials.token;
    this.baseUrl = resolveBaseUrl(credentials.host ?? null);
  }

  private headers(): HeadersInit {
    return {
      Authorization: `token ${this.token}`,
      Accept: "application/json",
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: this.headers() });
    if (response.status === 401) {
      throw new GitProviderAuthError("Forgejo token rejected (401)");
    }
    if (!response.ok) {
      throw new Error(`Forgejo request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }

  async getUser(): Promise<GitUser> {
    const data = await this.fetchJson<{
      id: number | string;
      username: string;
      avatar_url?: string;
      full_name?: string;
      email?: string;
      organization?: string;
    }>(`${this.baseUrl}/user`);
    return {
      id: String(data.id ?? ""),
      login: data.username ?? "",
      avatar_url: data.avatar_url ?? "",
      name: data.full_name ?? null,
      email: data.email ?? null,
      company: data.organization ?? null,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  async getSuggestedTasks(): Promise<SuggestedTask[]> {
    return [];
  }

  async searchRepositories(
    options: SearchRepositoriesOptions,
  ): Promise<RepositoryPage> {
    const { query, pageId, limit } = options;
    const numericPage = Math.max(
      1,
      Math.floor((decodePageId(pageId) ?? 0) / limit + 1),
    );
    const params = new URLSearchParams({
      page: String(numericPage),
      limit: String(limit),
      sort: "updated",
    });
    let url = `${this.baseUrl}/user/repos?${params.toString()}`;
    if (query) {
      // /repos/search is global by default; restrict to repos owned by the
      // authenticated user via uid so we mirror the OpenHands behavior.
      const uid = await this.resolveUserId();
      params.set("q", query);
      params.set("mode", "source");
      if (uid) params.set("uid", uid);
      url = `${this.baseUrl}/repos/search?${params.toString()}`;
    }
    const data = await this.fetchJson<ForgejoRepo[] | { data: ForgejoRepo[] }>(
      url,
    );
    const repos = Array.isArray(data) ? data : data.data;
    const items = repos.map((r) => this.parseRepository(r));
    const nextPageId =
      items.length === limit ? encodePageId(numericPage * limit) : null;
    return { items, next_page_id: nextPageId };
  }

  private async resolveUserId(): Promise<string | null> {
    if (this.cachedUserId !== null) return this.cachedUserId;
    try {
      const user = await this.getUser();
      this.cachedUserId = user.id || null;
    } catch {
      this.cachedUserId = null;
    }
    return this.cachedUserId;
  }

  async getBranches(options: ListBranchesOptions): Promise<BranchPage> {
    const { repository, query, pageId, limit } = options;
    const numericPage = Math.max(
      1,
      Math.floor((decodePageId(pageId) ?? 0) / limit + 1),
    );
    const params = new URLSearchParams({
      page: String(numericPage),
      limit: String(limit),
    });
    const data = await this.fetchJson<ForgejoBranch[]>(
      `${this.baseUrl}/repos/${repository}/branches?${params.toString()}`,
    );
    let branches = data;
    if (query) {
      const lowered = query.toLowerCase();
      branches = branches.filter((b) => b.name.toLowerCase().includes(lowered));
    }
    const items: Branch[] = branches.map((b) => ({
      name: b.name,
      commit_sha: b.commit?.id ?? b.commit?.sha ?? "",
      protected: b.protected ?? false,
    }));
    const nextPageId =
      !query && data.length === limit
        ? encodePageId(numericPage * limit)
        : null;
    return { items, next_page_id: nextPageId };
  }

  // eslint-disable-next-line class-methods-use-this
  async getInstallations(): Promise<InstallationPage> {
    return { items: [], next_page_id: null };
  }

  // eslint-disable-next-line class-methods-use-this
  private parseRepository(repo: ForgejoRepo): GitRepository {
    return {
      id: String(repo.id ?? ""),
      full_name: repo.full_name,
      git_provider: "forgejo",
      is_public: !(repo.private ?? false),
      stargazers_count: repo.stars_count,
      pushed_at: repo.updated_at,
      main_branch: repo.default_branch,
    };
  }
}
