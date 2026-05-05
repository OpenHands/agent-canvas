import { SuggestedTask, SuggestedTaskType } from "#/utils/types";
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
  SortOrder,
} from "./types";
import { decodePageId, encodePageId, paginateResults } from "./paging-utils";

const DEFAULT_BASE_URL = "https://api.github.com";
const DEFAULT_GRAPHQL_URL = "https://api.github.com/graphql";

const SUGGESTED_TASK_PR_QUERY = `
  query GetUserPRs($login: String!) {
    user(login: $login) {
      pullRequests(first: 50, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          number
          title
          repository { nameWithOwner }
          mergeable
          commits(last: 1) {
            nodes {
              commit { statusCheckRollup { state } }
            }
          }
          reviews(first: 50, states: [CHANGES_REQUESTED, COMMENTED]) {
            nodes { state }
          }
        }
      }
    }
  }
`;

const SUGGESTED_TASK_ISSUE_QUERY = `
  query GetUserIssues($login: String!) {
    user(login: $login) {
      issues(first: 50, states: [OPEN], filterBy: {assignee: $login}, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          number
          title
          repository { nameWithOwner }
        }
      }
    }
  }
`;

const SEARCH_BRANCHES_QUERY = `
  query SearchBranches($owner: String!, $name: String!, $query: String!, $perPage: Int!) {
    repository(owner: $owner, name: $name) {
      refs(refPrefix: "refs/heads/", query: $query, first: $perPage, orderBy: {field: ALPHABETICAL, direction: ASC}) {
        nodes {
          name
          target {
            __typename
            ... on Commit { oid committedDate }
          }
        }
      }
    }
  }
`;

const sortOrderToParams = (
  sortOrder: SortOrder | undefined,
): { sort: string; order: "asc" | "desc" } | null => {
  if (!sortOrder) return null;
  const lastDash = sortOrder.lastIndexOf("-");
  if (lastDash < 0) return null;
  const sort = sortOrder.slice(0, lastDash);
  const order = sortOrder.slice(lastDash + 1) as "asc" | "desc";
  return { sort, order };
};

const buildSearchUrl = (
  base: string,
  params: Record<string, string>,
): string => {
  const search = new URLSearchParams(params);
  return `${base}?${search.toString()}`;
};

const githubBaseUrls = (host: string | null) => {
  if (!host) {
    return { rest: DEFAULT_BASE_URL, graphql: DEFAULT_GRAPHQL_URL };
  }
  const trimmed = host.replace(/^https?:\/\//iu, "").replace(/\/+$/u, "");
  return {
    rest: `https://${trimmed}/api/v3`,
    graphql: `https://${trimmed}/api/graphql`,
  };
};

const parseLinkHeaderHasNext = (linkHeader: string | null): boolean =>
  !!linkHeader && /rel="next"/u.test(linkHeader);

interface GitHubRepoResponse {
  id: number | string;
  full_name: string;
  default_branch?: string;
  stargazers_count?: number;
  pushed_at?: string;
  private?: boolean;
}

interface GitHubBranchResponse {
  name: string;
  commit?: { sha?: string; commit?: { committer?: { date?: string } } };
  protected?: boolean;
}

export class GitHubService implements GitProviderService {
  readonly provider = "github" as const;

  private readonly token: string;

  private readonly host: string | null;

  private readonly baseUrl: string;

  private readonly graphqlUrl: string;

  private cachedLogin: string | null = null;

  private cachedOrgs: string[] | null = null;

  constructor(credentials: ProviderToken) {
    if (!credentials.token) {
      throw new GitProviderAuthError("GitHub token is empty");
    }
    this.token = credentials.token;
    this.host = credentials.host ?? null;
    const urls = githubBaseUrls(this.host);
    this.baseUrl = urls.rest;
    this.graphqlUrl = urls.graphql;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github.v3+json",
    };
  }

  private async fetchJson<T>(
    url: string,
  ): Promise<{ data: T; linkHeader: string | null }> {
    const response = await fetch(url, { headers: this.headers() });
    if (response.status === 401) {
      throw new GitProviderAuthError("GitHub token rejected (401)");
    }
    if (!response.ok) {
      throw new Error(`GitHub request failed (${response.status}): ${url}`);
    }
    const data = (await response.json()) as T;
    return { data, linkHeader: response.headers.get("Link") };
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.graphqlUrl, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (response.status === 401) {
      throw new GitProviderAuthError("GitHub token rejected (401)");
    }
    if (!response.ok) {
      throw new Error(`GitHub GraphQL request failed (${response.status})`);
    }
    const payload = (await response.json()) as { data: T; errors?: unknown };
    if (payload.errors) {
      throw new Error(
        `GitHub GraphQL error: ${JSON.stringify(payload.errors)}`,
      );
    }
    return payload.data;
  }

  async getUser(): Promise<GitUser> {
    const { data } = await this.fetchJson<{
      id: number | string;
      login: string;
      avatar_url?: string;
      company?: string | null;
      name?: string | null;
      email?: string | null;
    }>(`${this.baseUrl}/user`);

    let email = data.email ?? null;
    if (!email) {
      try {
        const { data: emails } = await this.fetchJson<
          Array<{ email: string; primary: boolean; verified: boolean }>
        >(`${this.baseUrl}/user/emails`);
        const primary = emails.find((entry) => entry.primary && entry.verified);
        email = primary?.email ?? null;
      } catch {
        email = null;
      }
    }

    return {
      id: String(data.id ?? ""),
      login: data.login ?? "",
      avatar_url: data.avatar_url ?? "",
      company: data.company ?? null,
      name: data.name ?? null,
      email,
    };
  }

  async getSuggestedTasks(): Promise<SuggestedTask[]> {
    const user = await this.getUser();
    const tasks: SuggestedTask[] = [];

    try {
      const prData = await this.graphql<{
        user: {
          pullRequests: {
            nodes: Array<{
              number: number;
              title: string;
              repository: { nameWithOwner: string };
              mergeable: string;
              commits: {
                nodes: Array<{
                  commit: { statusCheckRollup: { state: string } | null };
                }>;
              };
              reviews: { nodes: Array<{ state: string }> };
            }>;
          };
        };
      }>(SUGGESTED_TASK_PR_QUERY, { login: user.login });

      for (const pr of prData.user.pullRequests.nodes) {
        let taskType: SuggestedTaskType | "OPEN_PR" = "OPEN_PR";
        if (pr.mergeable === "CONFLICTING") {
          taskType = "MERGE_CONFLICTS";
        } else {
          const lastCommit = pr.commits.nodes[0]?.commit;
          const status = lastCommit?.statusCheckRollup?.state;
          if (status === "FAILURE") {
            taskType = "FAILING_CHECKS";
          } else if (
            pr.reviews.nodes.some(
              (review) =>
                review.state === "CHANGES_REQUESTED" ||
                review.state === "COMMENTED",
            )
          ) {
            taskType = "UNRESOLVED_COMMENTS";
          }
        }

        if (taskType !== "OPEN_PR") {
          tasks.push({
            git_provider: "github",
            task_type: taskType,
            repo: pr.repository.nameWithOwner,
            issue_number: pr.number,
            title: pr.title,
          });
        }
      }
    } catch {
      // Mirror Python: PR query failures should not block the issues query.
    }

    try {
      const issueData = await this.graphql<{
        user: {
          issues: {
            nodes: Array<{
              number: number;
              title: string;
              repository: { nameWithOwner: string };
            }>;
          };
        };
      }>(SUGGESTED_TASK_ISSUE_QUERY, { login: user.login });

      for (const issue of issueData.user.issues.nodes) {
        tasks.push({
          git_provider: "github",
          task_type: "OPEN_ISSUE",
          repo: issue.repository.nameWithOwner,
          issue_number: issue.number,
          title: issue.title,
        });
      }
    } catch {
      // Already collected PR tasks; surface what we have.
    }

    return tasks;
  }

  async searchRepositories(
    options: SearchRepositoriesOptions,
  ): Promise<RepositoryPage> {
    const { query, installationId, pageId, limit, sortOrder } = options;

    if (query) {
      // GitHub's /search/repositories endpoint searches the entire public
      // corpus when q has no user:/org: qualifier. Mirror the OpenHands OSS
      // behavior and scope to repos the authenticated user can reach: their
      // own + every org they belong to. Aggregate, dedupe by id, then
      // paginate client-side so the UI keeps cursor semantics.
      const aggregated = await this.searchUserScopedRepositories(
        query,
        sortOrder,
      );
      return paginateResults(aggregated, pageId, limit);
    }

    const numericPage = Math.max(
      1,
      Math.floor((decodePageId(pageId) ?? 0) / limit + 1),
    );
    const params: Record<string, string> = {
      per_page: String(limit),
      page: String(numericPage),
    };
    const sort = sortOrderToParams(sortOrder);
    if (sort) {
      params.sort = sort.sort;
      params.direction = sort.order;
    } else {
      params.sort = "pushed";
    }

    const baseUrl = installationId
      ? `${this.baseUrl}/user/installations/${installationId}/repositories`
      : `${this.baseUrl}/user/repos`;
    const url = buildSearchUrl(baseUrl, params);
    const { data, linkHeader } = await this.fetchJson<
      GitHubRepoResponse[] | { repositories: GitHubRepoResponse[] }
    >(url);
    const reposRaw = Array.isArray(data) ? data : (data.repositories ?? []);
    const items = reposRaw.map((repo) =>
      this.parseRepository(repo, linkHeader),
    );
    const nextPageId = parseLinkHeaderHasNext(linkHeader)
      ? encodePageId(numericPage * limit)
      : null;
    return { items, next_page_id: nextPageId };
  }

  private async searchUserScopedRepositories(
    query: string,
    sortOrder: SortOrder | undefined,
  ): Promise<GitRepository[]> {
    const baseParams: Record<string, string> = { per_page: "30" };
    const sort = sortOrderToParams(sortOrder);
    if (sort) {
      baseParams.sort = sort.sort;
      baseParams.order = sort.order;
    }

    const qualifiers: string[] = [];
    if (query.includes("/")) {
      const [owner, repoFragment] = query.split("/", 2);
      if (owner && repoFragment) {
        qualifiers.push(`org:${owner} in:name ${repoFragment}`);
      }
    } else {
      const login = await this.resolveLogin();
      qualifiers.push(`in:name ${query} user:${login}`);
      const orgs = await this.resolveOrgs();
      for (const org of orgs) {
        qualifiers.push(`org:${org} in:name ${query}`);
      }
    }

    const responses = await Promise.all(
      qualifiers.map(async (q) => {
        try {
          const url = buildSearchUrl(`${this.baseUrl}/search/repositories`, {
            ...baseParams,
            q,
          });
          const { data } = await this.fetchJson<{
            items: GitHubRepoResponse[];
          }>(url);
          return data.items;
        } catch {
          return [] as GitHubRepoResponse[];
        }
      }),
    );

    const seen = new Set<string>();
    const repos: GitRepository[] = [];
    for (const raw of responses.flat()) {
      const id = String(raw.id);
      if (!seen.has(id)) {
        seen.add(id);
        repos.push(this.parseRepository(raw));
      }
    }
    return repos;
  }

  private async resolveLogin(): Promise<string> {
    if (this.cachedLogin) return this.cachedLogin;
    const user = await this.getUser();
    this.cachedLogin = user.login;
    return user.login;
  }

  private async resolveOrgs(): Promise<string[]> {
    if (this.cachedOrgs) return this.cachedOrgs;
    try {
      const { data } = await this.fetchJson<Array<{ login: string }>>(
        `${this.baseUrl}/user/orgs?per_page=100`,
      );
      this.cachedOrgs = data.map((org) => org.login).filter(Boolean);
    } catch {
      this.cachedOrgs = [];
    }
    return this.cachedOrgs;
  }

  async getBranches(options: ListBranchesOptions): Promise<BranchPage> {
    const { repository, query, pageId, limit } = options;

    if (query) {
      const parts = repository.split("/");
      if (parts.length < 2) {
        return { items: [], next_page_id: null };
      }
      const [owner, name] = [parts[parts.length - 2], parts[parts.length - 1]];
      const perPage = Math.min(Math.max(limit, 1), 100);
      const data = await this.graphql<{
        repository: {
          refs: {
            nodes: Array<{
              name: string;
              target: {
                __typename?: string;
                oid?: string;
                committedDate?: string;
              } | null;
            }>;
          } | null;
        } | null;
      }>(SEARCH_BRANCHES_QUERY, { owner, name, query, perPage });
      const nodes = data.repository?.refs?.nodes ?? [];
      const items: Branch[] = nodes.map((node) => ({
        name: node.name,
        commit_sha: node.target?.oid ?? "",
        protected: false,
        last_push_date: node.target?.committedDate,
      }));
      return { items, next_page_id: null };
    }

    const numericPage = Math.max(
      1,
      Math.floor((decodePageId(pageId) ?? 0) / limit + 1),
    );
    const url = buildSearchUrl(`${this.baseUrl}/repos/${repository}/branches`, {
      per_page: String(limit),
      page: String(numericPage),
    });
    const { data, linkHeader } =
      await this.fetchJson<GitHubBranchResponse[]>(url);
    const items: Branch[] = data.map((branch) => ({
      name: branch.name,
      commit_sha: branch.commit?.sha ?? "",
      protected: branch.protected ?? false,
      last_push_date: branch.commit?.commit?.committer?.date,
    }));
    const nextPageId = parseLinkHeaderHasNext(linkHeader)
      ? encodePageId(numericPage * limit)
      : null;
    return { items, next_page_id: nextPageId };
  }

  async getInstallations(): Promise<InstallationPage> {
    const { data } = await this.fetchJson<{
      installations?: Array<{ id: number | string }>;
    }>(`${this.baseUrl}/user/installations`);
    const items = (data.installations ?? []).map((entry) => String(entry.id));
    return { items, next_page_id: null };
  }

  // eslint-disable-next-line class-methods-use-this
  private parseRepository(
    repo: GitHubRepoResponse,
    linkHeader?: string | null,
  ): GitRepository {
    return {
      id: String(repo.id ?? ""),
      full_name: repo.full_name,
      git_provider: "github",
      is_public: !(repo.private ?? true),
      stargazers_count: repo.stargazers_count,
      pushed_at: repo.pushed_at,
      main_branch: repo.default_branch,
      link_header: linkHeader ?? undefined,
    };
  }
}
