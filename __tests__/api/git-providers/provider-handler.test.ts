import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import {
  GitProviderAuthError,
  ProviderHandler,
} from "#/api/git-providers/provider-handler";

const writeProviders = (
  providers: Record<string, { token: string; host: string | null }>,
) => {
  window.localStorage.setItem(
    "openhands-agent-server-git-provider-tokens",
    JSON.stringify(providers),
  );
};

describe("ProviderHandler", () => {
  beforeEach(() => {
    window.localStorage.clear();
    server.resetHandlers();
  });
  afterEach(() => {
    server.resetHandlers();
    window.localStorage.clear();
  });

  it("aggregates suggested tasks across every configured provider", async () => {
    writeProviders({
      github: { token: "ghp_test", host: null },
      gitlab: { token: "glpat_test", host: null },
    });

    let githubCall = 0;
    server.use(
      http.get("https://api.github.com/user", () =>
        HttpResponse.json({ id: 1, login: "octocat" }),
      ),
      http.post("https://api.github.com/graphql", () => {
        githubCall += 1;
        if (githubCall === 1) {
          return HttpResponse.json({
            data: {
              user: {
                pullRequests: {
                  nodes: [
                    {
                      number: 1,
                      title: "GH conflict",
                      repository: { nameWithOwner: "octocat/r" },
                      mergeable: "CONFLICTING",
                      commits: { nodes: [] },
                      reviews: { nodes: [] },
                    },
                  ],
                },
              },
            },
          });
        }
        return HttpResponse.json({ data: { user: { issues: { nodes: [] } } } });
      }),
      http.get("https://gitlab.com/api/v4/user", () =>
        HttpResponse.json({ id: 99, username: "glab-user" }),
      ),
      http.post("https://gitlab.com/api/graphql", () =>
        HttpResponse.json({
          data: {
            currentUser: {
              authoredMergeRequests: {
                nodes: [
                  {
                    iid: "7",
                    title: "GL conflict",
                    project: { fullPath: "glab-user/r" },
                    conflicts: true,
                    pipelines: { nodes: [] },
                    discussions: { nodes: [] },
                  },
                ],
              },
            },
          },
        }),
      ),
      http.get("https://gitlab.com/api/v4/issues", () => HttpResponse.json([])),
    );

    const page = await ProviderHandler.getSuggestedTasks(undefined, 30);

    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ git_provider: "github", repo: "octocat/r" }),
        expect.objectContaining({ git_provider: "gitlab", repo: "glab-user/r" }),
      ]),
    );
    expect(page.items).toHaveLength(2);
    expect(page.next_page_id).toBeNull();
  });

  it("throws GitProviderAuthError when no providers are configured", async () => {
    await expect(ProviderHandler.getUserGitInfo()).rejects.toBeInstanceOf(
      GitProviderAuthError,
    );
  });
});
