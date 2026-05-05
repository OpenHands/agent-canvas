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
} from "./types";
import { decodePageId, encodePageId } from "./paging-utils";

const DEFAULT_BASE_URL = "https://gitlab.com/api/v4";
const DEFAULT_GRAPHQL_URL = "https://gitlab.com/api/graphql";

const SUGGESTED_TASK_QUERY = `
  query GetUserTasks {
    currentUser {
      authoredMergeRequests(state: opened, sort: UPDATED_DESC, first: 100) {
        nodes {
          iid
          title
          project { fullPath }
          conflicts
          mergeStatus
          pipelines(first: 1) { nodes { status } }
          discussions(first: 100) {
            nodes {
              notes { nodes { resolvable resolved } }
            }
          }
        }
      }
    }
  }
`;

const gitlabBaseUrls = (host: string | null) => {
  if (!host) {
    return { rest: DEFAULT_BASE_URL, graphql: DEFAULT_GRAPHQL_URL };
  }
  const trimmed = host.replace(/^https?:\/\//iu, "").replace(/\/+$/u, "");
  return {
    rest: `https://${trimmed}/api/v4`,
    graphql: `https://${trimmed}/api/graphql`,
  };
};

const encodeProjectId = (repository: string): string =>
  encodeURIComponent(repository);

interface GitLabProject {
  id: number | string;
  path_with_namespace: string;
  star_count?: number;
  visibility?: string;
  default_branch?: string;
  last_activity_at?: string;
}

interface GitLabBranch {
  name: string;
  protected?: boolean;
  commit?: { id?: string; committed_date?: string };
}

export class GitLabService implements GitProviderService {
  readonly provider = "gitlab" as const;

  private readonly token: string;

  private readonly baseUrl: string;

  private readonly graphqlUrl: string;

  constructor(credentials: ProviderToken) {
    if (!credentials.token) {
      throw new GitProviderAuthError("GitLab token is empty");
    }
    this.token = credentials.token;
    const urls = gitlabBaseUrls(credentials.host ?? null);
    this.baseUrl = urls.rest;
    this.graphqlUrl = urls.graphql;
  }

  private headers(): HeadersInit {
    return { Authorization: `Bearer ${this.token}` };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: this.headers() });
    if (response.status === 401) {
      throw new GitProviderAuthError("GitLab token rejected (401)");
    }
    if (!response.ok) {
      throw new Error(`GitLab request failed (${response.status}): ${url}`);
    }
    return (await response.json()) as T;
  }

  private async graphql<T>(query: string): Promise<T> {
    const response = await fetch(this.graphqlUrl, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      throw new Error(`GitLab GraphQL failed (${response.status})`);
    }
    const payload = (await response.json()) as { data: T; errors?: unknown };
    if (payload.errors) {
      throw new Error(
        `GitLab GraphQL error: ${JSON.stringify(payload.errors)}`,
      );
    }
    return payload.data;
  }

  async getUser(): Promise<GitUser> {
    const data = await this.fetchJson<{
      id: number | string;
      username: string;
      avatar_url?: string | null;
      name?: string | null;
      email?: string | null;
      organization?: string | null;
    }>(`${this.baseUrl}/user`);
    return {
      id: String(data.id ?? ""),
      login: data.username ?? "",
      avatar_url: data.avatar_url ?? "",
      name: data.name ?? null,
      email: data.email ?? null,
      company: data.organization ?? null,
    };
  }

  async getSuggestedTasks(): Promise<SuggestedTask[]> {
    const tasks: SuggestedTask[] = [];

    try {
      const user = await this.getUser();
      const data = await this.graphql<{
        currentUser: {
          authoredMergeRequests: {
            nodes: Array<{
              iid: string;
              title: string;
              project: { fullPath: string };
              conflicts: boolean;
              pipelines: { nodes: Array<{ status: string }> };
              discussions: {
                nodes: Array<{
                  notes: {
                    nodes: Array<{ resolvable: boolean; resolved: boolean }>;
                  };
                }>;
              };
            }>;
          };
        };
      }>(SUGGESTED_TASK_QUERY);

      for (const mr of data.currentUser?.authoredMergeRequests?.nodes ?? []) {
        let taskType: SuggestedTaskType | "OPEN_PR" = "OPEN_PR";
        if (mr.conflicts) {
          taskType = "MERGE_CONFLICTS";
        } else if (mr.pipelines.nodes[0]?.status === "FAILED") {
          taskType = "FAILING_CHECKS";
        } else {
          const hasUnresolved = mr.discussions.nodes.some((d) =>
            d.notes.nodes.some((n) => n.resolvable && !n.resolved),
          );
          if (hasUnresolved) {
            taskType = "UNRESOLVED_COMMENTS";
          }
        }
        if (taskType !== "OPEN_PR") {
          tasks.push({
            git_provider: "gitlab",
            task_type: taskType,
            repo: mr.project.fullPath,
            issue_number: Number.parseInt(mr.iid, 10),
            title: mr.title,
          });
        }
      }

      const issues = await this.fetchJson<
        Array<{
          iid: number;
          title: string;
          references?: { full?: string };
        }>
      >(
        `${this.baseUrl}/issues?${new URLSearchParams({
          assignee_username: user.login,
          state: "opened",
          scope: "assigned_to_me",
        }).toString()}`,
      );

      for (const issue of issues) {
        const repo = (issue.references?.full ?? "").split("#")[0]?.trim() ?? "";
        tasks.push({
          git_provider: "gitlab",
          task_type: "OPEN_ISSUE",
          repo,
          issue_number: issue.iid,
          title: issue.title,
        });
      }
    } catch {
      // Surface whatever we collected; mirrors Python's blanket except.
    }

    return tasks;
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
      per_page: String(limit),
      order_by: "last_activity_at",
      sort: "desc",
      membership: "true",
    });
    if (query) {
      params.set("search", query);
      params.set("search_namespaces", "true");
    }

    const projects = await this.fetchJson<GitLabProject[]>(
      `${this.baseUrl}/projects?${params.toString()}`,
    );
    const items = projects.map((project) => this.parseRepository(project));
    const nextPageId =
      items.length === limit ? encodePageId(numericPage * limit) : null;
    return { items, next_page_id: nextPageId };
  }

  async getBranches(options: ListBranchesOptions): Promise<BranchPage> {
    const { repository, query, pageId, limit } = options;
    const projectId = encodeProjectId(repository);
    const params = new URLSearchParams({ per_page: String(limit) });
    if (query) {
      params.set("search", query);
    } else {
      const numericPage = Math.max(
        1,
        Math.floor((decodePageId(pageId) ?? 0) / limit + 1),
      );
      params.set("page", String(numericPage));
    }
    const data = await this.fetchJson<GitLabBranch[]>(
      `${this.baseUrl}/projects/${projectId}/repository/branches?${params.toString()}`,
    );
    const items: Branch[] = data.map((branch) => ({
      name: branch.name,
      commit_sha: branch.commit?.id ?? "",
      protected: branch.protected ?? false,
      last_push_date: branch.commit?.committed_date,
    }));
    const numericPage = Math.max(
      1,
      Math.floor((decodePageId(pageId) ?? 0) / limit + 1),
    );
    const nextPageId =
      !query && items.length === limit
        ? encodePageId(numericPage * limit)
        : null;
    return { items, next_page_id: nextPageId };
  }

  // GitLab has no "installation" concept — return an empty page like the
  // Python backend does for providers without app installations.
  // eslint-disable-next-line class-methods-use-this
  async getInstallations(): Promise<InstallationPage> {
    return { items: [], next_page_id: null };
  }

  // eslint-disable-next-line class-methods-use-this
  private parseRepository(project: GitLabProject): GitRepository {
    return {
      id: String(project.id ?? ""),
      full_name: project.path_with_namespace,
      git_provider: "gitlab",
      is_public: project.visibility === "public",
      stargazers_count: project.star_count,
      pushed_at: project.last_activity_at,
      main_branch: project.default_branch,
    };
  }
}
