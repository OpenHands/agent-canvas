import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import { GitHubService } from "#/api/git-providers/github-service";

const buildService = (host: string | null = null) =>
  new GitHubService({ token: "ghp_test_token", host });

describe("GitHubService", () => {
  beforeEach(() => {
    server.resetHandlers();
  });
  afterEach(() => {
    server.resetHandlers();
  });

  it("getUser falls back to /user/emails when /user payload omits email", async () => {
    server.use(
      http.get("https://api.github.com/user", () =>
        HttpResponse.json({
          id: 4711,
          login: "octocat",
          avatar_url: "https://avatars.example/octocat.png",
          company: "GitHub",
          name: "The Octocat",
          email: null,
        }),
      ),
      http.get("https://api.github.com/user/emails", () =>
        HttpResponse.json([
          { email: "secondary@example.com", primary: false, verified: true },
          { email: "primary@example.com", primary: true, verified: true },
        ]),
      ),
    );

    const user = await buildService().getUser();

    expect(user).toEqual({
      id: "4711",
      login: "octocat",
      avatar_url: "https://avatars.example/octocat.png",
      company: "GitHub",
      name: "The Octocat",
      email: "primary@example.com",
    });
  });

  it("getSuggestedTasks discriminates conflict / failure / review-comment / open-issue", async () => {
    let graphqlCalls = 0;
    server.use(
      http.get("https://api.github.com/user", () =>
        HttpResponse.json({ id: 1, login: "octocat" }),
      ),
      http.post("https://api.github.com/graphql", async () => {
        graphqlCalls += 1;
        if (graphqlCalls === 1) {
          return HttpResponse.json({
            data: {
              user: {
                pullRequests: {
                  nodes: [
                    {
                      number: 1,
                      title: "Conflict PR",
                      repository: { nameWithOwner: "octocat/repo" },
                      mergeable: "CONFLICTING",
                      commits: { nodes: [] },
                      reviews: { nodes: [] },
                    },
                    {
                      number: 2,
                      title: "Failing PR",
                      repository: { nameWithOwner: "octocat/repo" },
                      mergeable: "MERGEABLE",
                      commits: {
                        nodes: [
                          {
                            commit: {
                              statusCheckRollup: { state: "FAILURE" },
                            },
                          },
                        ],
                      },
                      reviews: { nodes: [] },
                    },
                    {
                      number: 3,
                      title: "Reviewed PR",
                      repository: { nameWithOwner: "octocat/repo" },
                      mergeable: "MERGEABLE",
                      commits: {
                        nodes: [
                          {
                            commit: {
                              statusCheckRollup: { state: "SUCCESS" },
                            },
                          },
                        ],
                      },
                      reviews: { nodes: [{ state: "CHANGES_REQUESTED" }] },
                    },
                    {
                      number: 4,
                      title: "Plain open PR",
                      repository: { nameWithOwner: "octocat/repo" },
                      mergeable: "MERGEABLE",
                      commits: { nodes: [] },
                      reviews: { nodes: [] },
                    },
                  ],
                },
              },
            },
          });
        }
        return HttpResponse.json({
          data: {
            user: {
              issues: {
                nodes: [
                  {
                    number: 5,
                    title: "Investigate flake",
                    repository: { nameWithOwner: "octocat/repo" },
                  },
                ],
              },
            },
          },
        });
      }),
    );

    const tasks = await buildService().getSuggestedTasks();

    expect(tasks).toEqual([
      {
        git_provider: "github",
        task_type: "MERGE_CONFLICTS",
        repo: "octocat/repo",
        issue_number: 1,
        title: "Conflict PR",
      },
      {
        git_provider: "github",
        task_type: "FAILING_CHECKS",
        repo: "octocat/repo",
        issue_number: 2,
        title: "Failing PR",
      },
      {
        git_provider: "github",
        task_type: "UNRESOLVED_COMMENTS",
        repo: "octocat/repo",
        issue_number: 3,
        title: "Reviewed PR",
      },
      {
        git_provider: "github",
        task_type: "OPEN_ISSUE",
        repo: "octocat/repo",
        issue_number: 5,
        title: "Investigate flake",
      },
    ]);
  });

  it("searchRepositories paginates user repositories using the Link header", async () => {
    let firstPage = true;
    server.use(
      http.get("https://api.github.com/user/repos", ({ request }) => {
        const params = new URL(request.url).searchParams;
        const page = params.get("page");
        if (firstPage) {
          firstPage = false;
          return HttpResponse.json(
            [
              {
                id: 1,
                full_name: "octocat/repo-1",
                default_branch: "main",
                private: false,
                pushed_at: "2025-01-01T00:00:00Z",
              },
              {
                id: 2,
                full_name: "octocat/repo-2",
                default_branch: "main",
                private: true,
              },
            ],
            {
              headers: {
                Link: '<https://api.github.com/user/repos?page=2>; rel="next"',
              },
            },
          );
        }
        expect(page).toBe("2");
        return HttpResponse.json([
          {
            id: 3,
            full_name: "octocat/repo-3",
            default_branch: "trunk",
            private: false,
          },
        ]);
      }),
    );

    const service = buildService();
    const first = await service.searchRepositories({ limit: 2 });

    expect(first.items.map((repo) => repo.full_name)).toEqual([
      "octocat/repo-1",
      "octocat/repo-2",
    ]);
    expect(first.next_page_id).not.toBeNull();

    const second = await service.searchRepositories({
      limit: 2,
      pageId: first.next_page_id ?? undefined,
    });

    expect(second.items.map((repo) => repo.full_name)).toEqual(["octocat/repo-3"]);
    expect(second.next_page_id).toBeNull();
  });

  it("getBranches maps the GitHub branches response into BranchPage", async () => {
    server.use(
      http.get("https://api.github.com/repos/octocat/repo/branches", () =>
        HttpResponse.json([
          {
            name: "main",
            commit: {
              sha: "deadbeef",
              commit: { committer: { date: "2025-04-01T00:00:00Z" } },
            },
            protected: true,
          },
        ]),
      ),
    );

    const branches = await buildService().getBranches({
      repository: "octocat/repo",
      limit: 30,
    });

    expect(branches.items).toEqual([
      {
        name: "main",
        commit_sha: "deadbeef",
        protected: true,
        last_push_date: "2025-04-01T00:00:00Z",
      },
    ]);
  });

  it("scopes searchRepositories to the user's own repos and orgs (no global GitHub search)", async () => {
    const observedQs: string[] = [];
    server.use(
      http.get("https://api.github.com/user", () =>
        HttpResponse.json({ id: 1, login: "octocat" }),
      ),
      http.get("https://api.github.com/user/orgs", () =>
        HttpResponse.json([{ login: "acme-co" }]),
      ),
      http.get(
        "https://api.github.com/search/repositories",
        ({ request }) => {
          const q = new URL(request.url).searchParams.get("q") ?? "";
          observedQs.push(q);
          if (q.includes("user:octocat")) {
            return HttpResponse.json({
              items: [
                { id: 10, full_name: "octocat/test-helpers", private: true },
              ],
            });
          }
          if (q.includes("org:acme-co")) {
            return HttpResponse.json({
              items: [
                { id: 20, full_name: "acme-co/test-runner", private: false },
                // duplicate id from another sub-query — should be deduped
                { id: 10, full_name: "octocat/test-helpers", private: true },
              ],
            });
          }
          return HttpResponse.json({ items: [] });
        },
      ),
    );

    const page = await buildService().searchRepositories({
      query: "test",
      limit: 30,
    });

    expect(observedQs).toEqual(
      expect.arrayContaining([
        "in:name test user:octocat",
        "org:acme-co in:name test",
      ]),
    );
    // Crucially, NO bare `q=test` request should ever fire.
    expect(observedQs).not.toContain("test");
    expect(page.items.map((repo) => repo.full_name)).toEqual([
      "octocat/test-helpers",
      "acme-co/test-runner",
    ]);
  });

  it("uses the Enterprise base URL when host is configured", async () => {
    let calledUrl = "";
    server.use(
      http.get(
        "https://github.example.com/api/v3/user",
        ({ request }) => {
          calledUrl = request.url;
          return HttpResponse.json({ id: 1, login: "ghe-user" });
        },
      ),
    );

    await new GitHubService({
      token: "ghp_x",
      host: "github.example.com",
    }).getUser();

    expect(calledUrl).toBe("https://github.example.com/api/v3/user");
  });
});
