import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import GitService from "#/api/git-service/git-service.api";

const writeProviders = (
  providers: Record<string, { token: string; host: string | null }>,
) => {
  window.localStorage.setItem(
    "openhands-agent-server-git-provider-tokens",
    JSON.stringify(providers),
  );
};

describe("GitService legacy contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    server.resetHandlers();
  });
  afterEach(() => {
    window.localStorage.clear();
    server.resetHandlers();
  });

  it("searchGitRepositories scopes the GitHub query to the user's own repos and orgs", async () => {
    writeProviders({ github: { token: "ghp_test", host: null } });
    server.use(
      http.get("https://api.github.com/user", () =>
        HttpResponse.json({ id: 1, login: "octocat" }),
      ),
      http.get("https://api.github.com/user/orgs", () => HttpResponse.json([])),
      http.get(
        "https://api.github.com/search/repositories",
        ({ request }) => {
          const q = new URL(request.url).searchParams.get("q") ?? "";
          // Only the scoped query should ever execute; bare "react" is what
          // returned global popular repos before the fix.
          expect(q).toBe("in:name react user:octocat");
          return HttpResponse.json({
            items: [
              {
                id: 100,
                full_name: "octocat/react-app",
                private: false,
                default_branch: "main",
              },
              {
                id: 101,
                full_name: "octocat/react-utils",
                private: true,
                default_branch: "main",
              },
            ],
          });
        },
      ),
    );

    const page = await GitService.searchGitRepositories("react", "github", 30);

    expect(page.items.map((repo) => repo.full_name)).toEqual([
      "octocat/react-app",
      "octocat/react-utils",
    ]);
    expect(page.items.every((repo) => repo.git_provider === "github")).toBe(true);
  });
});
