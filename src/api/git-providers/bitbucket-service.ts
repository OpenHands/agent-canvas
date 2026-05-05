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

const BASE_URL = "https://api.bitbucket.org/2.0";

const buildAuthHeader = (token: string): string =>
  token.includes(":")
    ? `Basic ${typeof window === "undefined" ? Buffer.from(token).toString("base64") : btoa(token)}`
    : `Bearer ${token}`;

interface BitbucketRepoResponse {
  uuid: string;
  slug: string;
  workspace?: { slug?: string };
  is_private?: boolean;
  updated_on?: string;
  mainbranch?: { name?: string };
}

interface BitbucketBranchResponse {
  name: string;
  target?: { hash?: string; date?: string };
}

export class BitbucketService implements GitProviderService {
  readonly provider = "bitbucket" as const;

  private readonly token: string;

  constructor(credentials: ProviderToken) {
    if (!credentials.token) {
      throw new GitProviderAuthError("Bitbucket token is empty");
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
      throw new GitProviderAuthError("Bitbucket token rejected (401)");
    }
    if (!response.ok) {
      throw new Error(`Bitbucket request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }

  async getUser(): Promise<GitUser> {
    const data = await this.fetchJson<{
      account_id?: string;
      username?: string;
      display_name?: string;
      links?: { avatar?: { href?: string } };
    }>(`${BASE_URL}/user`);
    let email: string | null = null;
    try {
      const emails = await this.fetchJson<{
        values: Array<{
          email: string;
          is_primary: boolean;
          is_confirmed: boolean;
        }>;
      }>(`${BASE_URL}/user/emails`);
      const primary = emails.values.find((e) => e.is_primary && e.is_confirmed);
      email = primary?.email ?? null;
    } catch {
      email = null;
    }
    return {
      id: data.account_id ?? "",
      login: data.username ?? "",
      avatar_url: data.links?.avatar?.href ?? "",
      name: data.display_name ?? null,
      email,
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
    const numericPage = Math.max(
      1,
      Math.floor((decodePageId(pageId) ?? 0) / limit + 1),
    );

    const workspace =
      installationId ??
      (query?.includes("/") ? query.split("/")[0] : undefined);
    if (!workspace) {
      // Match the Python flow: when there's no workspace context yet, list
      // workspaces so the UI can let the user pick one. Returning empty here
      // keeps the existing dropdown experience predictable.
      return { items: [], next_page_id: null };
    }

    const params = new URLSearchParams({
      pagelen: String(limit),
      page: String(numericPage),
      sort: "-updated_on",
    });
    if (query?.includes("/")) {
      const [, slug] = query.split("/", 2);
      if (slug) params.set("q", `name~"${slug}"`);
    } else if (query) {
      params.set("q", `name~"${query}"`);
    }

    const data = await this.fetchJson<{
      values: BitbucketRepoResponse[];
      next?: string;
    }>(`${BASE_URL}/repositories/${workspace}?${params.toString()}`);
    const items = data.values.map((repo) => this.parseRepository(repo));
    const nextPageId = data.next ? encodePageId(numericPage * limit) : null;
    return { items, next_page_id: nextPageId };
  }

  async getBranches(options: ListBranchesOptions): Promise<BranchPage> {
    const { repository, query, pageId, limit } = options;
    const parts = repository.split("/");
    if (parts.length < 2) return { items: [], next_page_id: null };
    const [workspace, slug] = [
      parts[parts.length - 2],
      parts[parts.length - 1],
    ];
    const numericPage = Math.max(
      1,
      Math.floor((decodePageId(pageId) ?? 0) / limit + 1),
    );
    const params = new URLSearchParams({
      pagelen: String(limit),
      page: String(numericPage),
      sort: "-target.date",
    });
    if (query) params.set("q", `name~"${query}"`);
    const data = await this.fetchJson<{
      values: BitbucketBranchResponse[];
      next?: string;
    }>(
      `${BASE_URL}/repositories/${workspace}/${slug}/refs/branches?${params.toString()}`,
    );
    const items: Branch[] = data.values.map((b) => ({
      name: b.name,
      commit_sha: b.target?.hash ?? "",
      protected: false,
      last_push_date: b.target?.date,
    }));
    const nextPageId = data.next ? encodePageId(numericPage * limit) : null;
    return { items, next_page_id: nextPageId };
  }

  async getInstallations(
    options: ListInstallationsOptions,
  ): Promise<InstallationPage> {
    const { pageId, limit } = options;
    const numericPage = Math.max(
      1,
      Math.floor((decodePageId(pageId) ?? 0) / limit + 1),
    );
    const data = await this.fetchJson<{
      values: Array<{ slug: string }>;
      next?: string;
    }>(
      `${BASE_URL}/workspaces?${new URLSearchParams({
        pagelen: String(limit),
        page: String(numericPage),
      }).toString()}`,
    );
    const items = data.values.map((w) => w.slug);
    const nextPageId = data.next ? encodePageId(numericPage * limit) : null;
    return { items, next_page_id: nextPageId };
  }

  // eslint-disable-next-line class-methods-use-this
  private parseRepository(repo: BitbucketRepoResponse): GitRepository {
    const workspaceSlug = repo.workspace?.slug ?? "";
    const fullName =
      workspaceSlug && repo.slug ? `${workspaceSlug}/${repo.slug}` : "";
    return {
      id: repo.uuid ?? "",
      full_name: fullName,
      git_provider: "bitbucket",
      is_public: !(repo.is_private ?? true),
      pushed_at: repo.updated_on,
      main_branch: repo.mainbranch?.name,
    };
  }
}
